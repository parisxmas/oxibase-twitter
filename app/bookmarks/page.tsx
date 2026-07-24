"use client";

// Bookmarks are the row-level rule in plain sight: this page asks for *every*
// bookmark in the collection and receives only the reader's own, because the
// read rule is `auth.username == doc.owner` and the server applies it per row.

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { myBookmarks, timeline } from "@/lib/data";
import type { Post } from "@/lib/types";
import { Feed, useFeedData } from "../feed";

export default function Bookmarks() {
  const { session, ready } = useSession();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) return setLoading(false);
    const [marks, all] = await Promise.all([myBookmarks(), timeline(200)]);
    const keep = new Set(marks.map((b) => b.post_ts));
    setPosts(all.filter((p) => keep.has(p.ts)));
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
      {loading ? <p className="center muted">Loading…</p> : <Feed posts={posts} state={state} onChanged={load} empty="Nothing saved yet." />}
    </>
  );
}
