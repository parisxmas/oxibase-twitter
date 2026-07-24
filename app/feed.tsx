"use client";

// A list of posts with everything they need: authors, counts, and the
// viewer's own likes/reposts/bookmarks. Shared by the timeline, profiles,
// threads, search and bookmarks, so those pages stay about their own logic.

import { useCallback, useEffect, useState } from "react";
import { oxibase } from "@/lib/oxibase";
import { useSession } from "@/lib/session";
import type { Post, Profile } from "@/lib/types";
import { allLikes, allReposts, myBookmarks, profiles, repliesTo } from "@/lib/data";
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
export function useFeedData(posts: Post[]): FeedState {
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
      const [profs, likes, reps] = await Promise.all([profiles(), allLikes(), allReposts()]);
      if (!alive) return;

      setAuthors(new Map(profs.map((p) => [p.handle, p])));

      const c = new Map<number, Counts>();
      const bump = (ts: number, key: keyof Counts) => {
        const cur = c.get(ts) ?? { likes: 0, reposts: 0, replies: 0 };
        cur[key] += 1;
        c.set(ts, cur);
      };
      for (const l of likes) bump(l.post_ts, "likes");
      for (const r of reps) bump(r.post_ts, "reposts");
      // Reply counts come from the posts themselves.
      const replyCounts = await Promise.all(posts.map((p) => repliesTo(p.ts)));
      posts.forEach((p, i) => {
        const cur = c.get(p.ts) ?? { likes: 0, reposts: 0, replies: 0 };
        cur.replies = replyCounts[i].length;
        c.set(p.ts, cur);
      });
      if (!alive) return;
      setCounts(c);

      if (session) {
        setLiked(new Set(likes.filter((l) => l.owner === session.email).map((l) => l.post_ts)));
        setReposted(new Set(reps.filter((r) => r.owner === session.email).map((r) => r.post_ts)));
        // No filter needed: the read rule returns only your own bookmarks.
        const marks = await myBookmarks();
        if (alive) setSaved(new Set(marks.map((b) => b.post_ts)));
      } else {
        setLiked(new Set());
        setReposted(new Set());
        setSaved(new Set());
      }
    })();
    return () => {
      alive = false;
    };
    // `posts` is compared by its identity list, so a new array of the same
    // posts does not re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts.map((p) => p.ts).join(","), session?.email, nonce]);

  return { authors, counts, liked, reposted, saved, reload };
}

export function Feed({
  posts,
  state,
  onChanged,
  empty = "Nothing here yet.",
  showAnalytics = true,
}: {
  posts: Post[];
  state: FeedState;
  onChanged: () => void;
  empty?: string;
  showAnalytics?: boolean;
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
