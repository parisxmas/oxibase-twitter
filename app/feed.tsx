"use client";

// A list of posts with everything they need: authors, counts, and the
// viewer's own likes/reposts/bookmarks. Shared by the timeline, profiles,
// threads, search and bookmarks, so those pages stay about their own logic.

import { useCallback, useEffect, useState } from "react";
import { oxibase } from "@/lib/oxibase";
import { useSession } from "@/lib/session";
import type { Post, Profile } from "@/lib/types";
import {
  likeCounts,
  myBookmarks,
  myLikes,
  myReposts,
  profiles,
  replyCounts,
  repostCounts,
} from "@/lib/data";
import { PostCard, type Counts } from "./post-card";

export type FeedState = {
  authors: Map<string, Profile>;
  counts: Map<number, Counts>;
  liked: Set<number>;
  reposted: Set<number>;
  saved: Set<number>;
  reload: () => void;
};

/** Load everything that decorates a set of posts. */
export function useFeedData(_posts: Post[]): FeedState {
  const { session } = useSession();
  const [authors, setAuthors] = useState<Map<string, Profile>>(new Map());
  const [counts, setCounts] = useState<Map<number, Counts>>(new Map());
  const [liked, setLiked] = useState<Set<number>>(new Set());
  const [reposted, setReposted] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Four requests, whatever the timeline's length. Counting used to mean
      // one request per post for replies plus downloading every like in the
      // project; both are now a single `$group` each, done by the engine.
      const [profs, likes, reposts, replies] = await Promise.all([
        profiles(),
        likeCounts(),
        repostCounts(),
        replyCounts(),
      ]);
      if (!alive) return;

      setAuthors(new Map(profs.map((p) => [p.handle, p])));

      const c = new Map<number, Counts>();
      for (const ts of new Set([...likes.keys(), ...reposts.keys(), ...replies.keys()])) {
        c.set(ts, {
          likes: likes.get(ts) ?? 0,
          reposts: reposts.get(ts) ?? 0,
          replies: replies.get(ts) ?? 0,
        });
      }
      setCounts(c);

      if (session) {
        // What *you* reacted to is a filtered read of your own rows — small,
        // and unrelated to how many other people reacted.
        const [mine, minerep, marks] = await Promise.all([
          myLikes(session.email),
          myReposts(session.email),
          myBookmarks(),
        ]);
        if (!alive) return;
        setLiked(new Set(mine));
        setReposted(new Set(minerep));
        setSaved(new Set(marks.map((b) => b.post_ts)));
      } else {
        setLiked(new Set());
        setReposted(new Set());
        setSaved(new Set());
      }
    })();
    return () => {
      alive = false;
    };
    // Counts are per project, not per visible post, so this does not re-run
    // when the list changes — only when the viewer or a write does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.email, nonce]);

  return { authors, counts, liked, reposted, saved, reload };
}

export function Feed({
  posts,
  state,
  onChanged,
  empty = "Nothing here yet.",
  showAnalytics = true,
  detail = false,
}: {
  posts: Post[];
  state: FeedState;
  onChanged: () => void;
  empty?: string;
  showAnalytics?: boolean;
  detail?: boolean;
}) {
  if (posts.length === 0) {
    return <p className="center muted">{empty}</p>;
  }
  return (
    <>
      {posts.map((p) => (
        <PostCard
          key={p.ts}
          post={p}
          author={state.authors.get(p.handle)}
          counts={state.counts.get(p.ts) ?? { likes: 0, reposts: 0, replies: 0 }}
          liked={state.liked.has(p.ts)}
          reposted={state.reposted.has(p.ts)}
          saved={state.saved.has(p.ts)}
          showAnalytics={showAnalytics}
          detail={detail}
          onChanged={() => {
            state.reload();
            onChanged();
          }}
        />
      ))}
    </>
  );
}

/** Subscribe to live post inserts; returns how many arrived since the last read. */
export function useLivePosts(onInsert: (p: Post) => void) {
  useEffect(() => {
    const sub = oxibase().subscribe("posts", (e) => {
      if (e.op === "insert" && e.doc) onInsert(e.doc as unknown as Post);
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
