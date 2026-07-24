"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { searchPosts } from "@/lib/data";
import type { Post } from "@/lib/types";
import { Feed, useFeedData } from "../feed";
import { SkeletonFeed, Spinner } from "../loading-ui";

function SearchInner() {
  const params = useSearchParams();
  const router = useRouter();
  const initial = params.get("q") ?? "";
  const [q, setQ] = useState(initial);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async (term: string) => {
    if (!term.trim()) return setPosts([]);
    setLoading(true);
    setPosts(await searchPosts(term));
    setLoading(false);
  }, []);

  useEffect(() => {
    setQ(initial);
    run(initial);
  }, [initial, run]);

  const state = useFeedData(posts);

  return (
    <>
      <div className="topbar">
        <form
          style={{ flex: 1 }}
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/search?q=${encodeURIComponent(q)}`);
          }}
        >
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search posts or #tags" />
        </form>
        <span className="engine">documents</span>
      </div>
      <p className="muted small" style={{ padding: "10px 16px", margin: 0 }}>
        A plain term matches the body (<code>ilike</code>); <code>#tag</code> matches the parsed tag
        array (<code>contains</code>). Both are URL filters the server turns into a query.
      </p>
      {loading ? (
        <SkeletonFeed rows={3} />
      ) : (
        <Feed posts={posts} state={state} onChanged={() => run(q)} empty={initial ? "No matches." : "Type something above."} />
      )}
    </>
  );
}

export default function Search() {
  return (
    <Suspense fallback={<Spinner />}>
      <SearchInner />
    </Suspense>
  );
}
