"use client";

// Cursor pagination with a sentinel: load the next page when the bottom of the
// list comes into view, and stop asking once a short page comes back.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Post } from "@/lib/types";

const PAGE = 20;

/**
 * `enabled` holds the first page back until the caller knows what to ask for:
 * before the stored session has been read, a timeline query would run as the
 * anon reader and be thrown away a tick later. `loading` starts true, so the
 * skeleton covers the wait either way.
 */
export function usePagedPosts(
  fetchPage: (limit: number, before?: number) => Promise<Post[]>,
  enabled = true,
) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);
  // Guards against a second request while one is in flight, which an
  // observer will otherwise happily fire during a fast scroll.
  const busy = useRef(false);

  const reload = useCallback(async () => {
    busy.current = true;
    setLoading(true);
    const first = await fetchPage(PAGE);
    setPosts(first);
    setDone(first.length < PAGE);
    setLoading(false);
    busy.current = false;
  }, [fetchPage]);

  useEffect(() => {
    if (enabled) reload();
  }, [reload, enabled]);

  const more = useCallback(async () => {
    if (busy.current || done) return;
    const oldest = posts[posts.length - 1]?.ts;
    if (!oldest) return;
    busy.current = true;
    setLoadingMore(true);
    const next = await fetchPage(PAGE, oldest);
    setPosts((prev) => {
      // De-duplicate on `ts`: a post arriving over realtime can also appear in
      // the next page.
      const seen = new Set(prev.map((p) => p.ts));
      return [...prev, ...next.filter((p) => !seen.has(p.ts))];
    });
    setDone(next.length < PAGE);
    setLoadingMore(false);
    busy.current = false;
  }, [posts, done, fetchPage]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    // A margin so the next page starts loading before the reader reaches the
    // end, rather than after they are already staring at the bottom.
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && more(), {
      rootMargin: "600px",
    });
    io.observe(node);

    // Belt and braces: the observer is the mechanism, but it is the part most
    // likely to misbehave on a given browser (a scroll container in the
    // ancestry, momentum scrolling, a sentinel with no height). Distance to the
    // bottom is boring and works everywhere, and `more()` already guards
    // against running twice or past the end, so the two cannot double-fetch.
    const onScroll = () => {
      const el = document.scrollingElement;
      if (!el) return;
      if (el.scrollHeight - (window.scrollY + window.innerHeight) < 600) more();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [more]);

  return { posts, setPosts, loading, loadingMore, done, sentinel, reload };
}
