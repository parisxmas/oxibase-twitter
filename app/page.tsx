"use client";

// The home timeline.
//
//   documents — posts, likes, reposts and bookmarks are collections; the rules
//               decide who may write what
//   realtime  — new posts arrive over a WebSocket and are held behind a
//               "show N posts" button, the way a timeline should behave
//   sql       — the "Following" tab reads the follow graph, a relational table

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { timeline } from "@/lib/data";
import type { Post } from "@/lib/types";
import { Composer } from "./composer";
import { Feed, useFeedData, useLivePosts } from "./feed";
import { SkeletonFeed, Spinner } from "./loading-ui";
import { usePagedPosts } from "./use-paged";

export default function Home() {
  const { session, ready } = useSession();
  const [pending, setPending] = useState<Post[]>([]);
  const [tab, setTab] = useState<"all" | "following">("all");
  const [following, setFollowing] = useState<Set<string>>(new Set());

  const fetchPage = useCallback((limit: number, before?: number) => timeline(limit, before), []);
  const { posts, setPosts, loading, loadingMore, done, sentinel, reload } = usePagedPosts(fetchPage);

  const load = useCallback(() => {
    setPending([]);
    reload();
  }, [reload]);

  // Who the signed-in reader follows — a SQL query, served by a route handler.
  useEffect(() => {
    if (!session) {
      setFollowing(new Set());
      return;
    }
    fetch(`/api/follow?who=${encodeURIComponent(session.email)}`)
      .then((r) => (r.ok ? r.json() : { following: [] }))
      .then((d) => setFollowing(new Set(d.following ?? [])));
  }, [session]);

  // Live arrivals are held rather than injected, so the page does not move
  // under the reader. Replies are not offered: the timeline does not show
  // them, so counting them would be a button that reveals nothing.
  useLivePosts((p) => {
    if (p.reply_to) return;
    setPending((prev) => (prev.some((x) => x.ts === p.ts) ? prev : [p, ...prev]));
  });

  const shown =
    tab === "all"
      ? posts
      : posts.filter((p) => following.has(p.owner) || p.owner === session?.email);
  const state = useFeedData(shown);

  const newOnes = pending.filter((p) => !posts.some((x) => x.ts === p.ts));

  return (
    <>
      <div className="topbar">
        <h1>Home</h1>
        <span className="engine" style={{ marginLeft: "auto" }}>documents · realtime</span>
      </div>

      <div className="tabs">
        <button className={tab === "all" ? "on" : ""} onClick={() => setTab("all")}>
          Everyone
        </button>
        <button className={tab === "following" ? "on" : ""} onClick={() => setTab("following")}>
          Following
        </button>
      </div>

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
            posts={shown}
            state={state}
            onChanged={load}
            onRemoved={(ts) => setPosts((prev) => prev.filter((p) => p.ts !== ts))}
            empty={
              tab === "following"
                ? "Nothing from the people you follow yet — try the Everyone tab."
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
