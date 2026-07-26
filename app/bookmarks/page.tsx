"use client";

// Bookmarks are the row-level rule in plain sight: this page asks for *every*
// bookmark in the collection and receives only the reader's own, because the
// read rule is `auth.username == doc.owner` and the server applies it per row.

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { myBookmarks, postsByTsList } from "@/lib/data";
import type { Post } from "@/lib/types";
import { Feed, useFeedData } from "../feed";
import { SkeletonFeed } from "../loading-ui";

export default function Bookmarks() {
  const { session, ready } = useSession();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) return setLoading(false);
    // Ask for the bookmarked posts themselves. Scanning the newest 200 posts for
    // matches dropped anything older than that — and every bookmarked *reply*,
    // since the timeline is top-level posts only.
    const marks = await myBookmarks();
    const rows = await postsByTsList(marks.map((b) => b.post_ts));
    const byTs = new Map(rows.map((p) => [p.ts, p]));
    // Newest bookmarked first, which is the order they were saved in — not the
    // order the posts happen to have been written in.
    setPosts(marks.map((b) => byTs.get(b.post_ts)).filter((p): p is Post => !!p));
    setLoading(false);
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  const state = useFeedData(posts);

  if (ready && !session) {
    return (
      <>
        <div className="topbar"><h1>Bookmarks</h1></div>
        <p className="center muted">Sign in to keep bookmarks.</p>
      </>
    );
  }

  return (
    <>
      <div className="topbar">
        <h1>Bookmarks</h1>
        <span className="engine" style={{ marginLeft: "auto" }}>row-level rule</span>
      </div>
      <p className="muted small" style={{ padding: "10px 16px", margin: 0 }}>
        This page asks the server for every bookmark and gets only yours — the filtering is the
        rule&apos;s, not the query&apos;s.
      </p>
      {loading ? <SkeletonFeed rows={3} /> : <Feed posts={posts} state={state} onChanged={load} empty="Nothing saved yet." />}
    </>
  );
}
