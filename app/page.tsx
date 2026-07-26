"use client";

// The home timeline.
//
//   documents — posts, likes, reposts and bookmarks are collections; the rules
//               decide who may write what
//   realtime  — new posts arrive over a WebSocket and are held behind a
//               "show N posts" button, the way a timeline should behave
//   sql       — the "Following" tab reads the follow graph, a relational table

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/session";
import { timeline } from "@/lib/data";
import { followGraph } from "@/lib/follow-graph";
import type { Post } from "@/lib/types";
import { Composer } from "./composer";
import { Feed, useFeedData, useLivePosts } from "./feed";
import { SkeletonFeed, Spinner } from "./loading-ui";
import { usePagedPosts } from "./use-paged";

export default function Home() {
  const { session, ready } = useSession();
  const [pending, setPending] = useState<Post[]>([]);
  const [tab, setTab] = useState<"all" | "following">("all");
  const [following, setFollowing] = useState<string[]>([]);
  const [knowsFollowing, setKnowsFollowing] = useState(false);

  // What the query depends on has to be compared by *value*, or the timeline
  // re-runs for no reason: `following` is a fresh array every time it is set
  // (including the empty one on sign-out), and `session` is a fresh object on
  // every token renewal. Either one reloaded the whole feed.
  const followKey = following.join(","); // an address cannot contain a comma
  const follows = useMemo(() => (followKey ? followKey.split(",") : []), [followKey]);
  const email = session?.email;

  // The Following tab is a different query, not a filter over this one — so they
  // are two callbacks, not one that branches. A single branching callback would
  // depend on the follow list even on the Everyone tab, which does not use it:
  // the list arrives a moment after sign-in, and the whole timeline reloaded.
  const fetchAll = useCallback((limit: number, before?: number) => timeline(limit, before), []);
  const fetchFollowing = useCallback(
    (limit: number, before?: number) =>
      timeline(limit, before, [...follows, ...(email ? [email] : [])]),
    [follows, email],
  );
  const fetchPage = tab === "following" ? fetchFollowing : fetchAll;
  // Held until the stored session is known: otherwise the first page is fetched
  // as the anon reader, then thrown away and refetched as the user.
  const { posts, setPosts, loading, loadingMore, done, sentinel, reload } = usePagedPosts(
    fetchPage,
    ready,
  );

  const load = useCallback(() => {
    setPending([]);
    reload();
  }, [reload]);

  // Who the signed-in reader follows — a SQL query, served by a route handler.
  useEffect(() => {
    if (!session) {
      setFollowing([]);
      setKnowsFollowing(false);
      setTab("all");
      return;
    }
    followGraph(session.email).then((g) => {
      setFollowing(g.following);
      setKnowsFollowing(true);
    });
  }, [session]);

  // Live arrivals are held rather than injected, so the page does not move
  // under the reader. Replies are not offered: the timeline does not show
  // them, so counting them would be a button that reveals nothing.
  useLivePosts((p) => {
    if (p.reply_to) return;
    setPending((prev) => (prev.some((x) => x.ts === p.ts) ? prev : [p, ...prev]));
  });

  const state = useFeedData(posts);

  const newOnes = pending.filter((p) => !posts.some((x) => x.ts === p.ts));

  return (
    <>
      <div className="topbar">
        <h1>Home</h1>
        <span className="engine" style={{ marginLeft: "auto" }}>documents · realtime</span>
      </div>

      {session && (
        <div className="tabs">
          <button className={tab === "all" ? "on" : ""} onClick={() => setTab("all")}>
            Everyone
          </button>
          <button className={tab === "following" ? "on" : ""} onClick={() => setTab("following")}>
            Following
          </button>
        </div>
      )}

      {ready && session && <Composer onPosted={load} />}
      {ready && !session && (
        <p className="center muted">
          You&apos;re reading with the public key — anyone can read, the rules decide who can write.{" "}
          <a href="/login" className="tag">Sign in</a> to post.
        </p>
      )}

      {newOnes.length > 0 && (
        <button className="newposts" onClick={load}>
          Show {newOnes.length} new post{newOnes.length > 1 ? "s" : ""}
        </button>
      )}

      {loading ? (
        <SkeletonFeed />
      ) : (
        <>
          <Feed
            posts={posts}
            state={state}
            onChanged={load}
            onRemoved={(ts) => setPosts((prev) => prev.filter((p) => p.ts !== ts))}
            empty={
              tab === "following"
                ? knowsFollowing && following.length === 0
                  ? "You do not follow anyone yet — try the Everyone tab."
                  : "Nobody you follow has posted yet."
                : "No posts yet. Be the first."
            }
          />
          {/* Crossing this starts the next page, 600px before the end. */}
          <div ref={sentinel} />
          {loadingMore && <Spinner />}
          {done && posts.length > 0 && (
            <p className="center muted small">That&apos;s everything.</p>
          )}
        </>
      )}
    </>
  );
}
