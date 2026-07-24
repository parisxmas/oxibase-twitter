"use client";

// One post, with its actions. Used by every timeline in the app.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { mediaUrl } from "@/lib/oxibase";
import { useSession, authHeader } from "@/lib/session";
import { relativeTime, type Post, type Profile } from "@/lib/types";
import { deletePost, toggleBookmark, toggleLike, toggleRepost } from "@/lib/data";

export type Counts = { likes: number; reposts: number; replies: number };

export function PostCard({
  post,
  author,
  counts,
  liked,
  reposted,
  saved,
  onChanged,
  showAnalytics = false,
}: {
  post: Post;
  author?: Profile | null;
  counts: Counts;
  liked: boolean;
  reposted: boolean;
  saved: boolean;
  onChanged: () => void;
  showAnalytics?: boolean;
}) {
  const { session } = useSession();
  const [busy, setBusy] = useState(false);
  const [views, setViews] = useState<{ total: number; hourly: { ts: number; value: number }[] } | null>(null);
  const [openAnalytics, setOpenAnalytics] = useState(false);
  const seen = useRef(false);
  const ref = useRef<HTMLElement | null>(null);

  // An impression, once, when the post actually comes into view. The write
  // itself is a time-series append, which only the server may do.
  useEffect(() => {
    const node = ref.current;
    if (!node || seen.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !seen.current) {
          seen.current = true;
          fetch("/api/view", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ post_ts: post.ts }),
          }).catch(() => {});
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [post.ts]);

  const mine = session?.email === post.owner;

  async function act(fn: () => Promise<unknown>) {
    if (!session) return;
    setBusy(true);
    await fn();
    setBusy(false);
    onChanged();
  }

  async function loadAnalytics() {
    if (!session) return;
    setOpenAnalytics((o) => !o);
    if (views) return;
    const r = await fetch(`/api/analytics?post_ts=${post.ts}`, { headers: authHeader(session) });
    if (r.ok) setViews(await r.json());
  }

  const max = Math.max(1, ...(views?.hourly ?? []).map((h) => h.value));

  return (
    <article className="post" ref={ref as React.RefObject<HTMLElement>}>
      <Link href={`/u/${post.handle}`} className="avatar">
        {author?.avatar_key ? (
          <img src={mediaUrl(author.avatar_key)} alt="" />
        ) : (
          (author?.name ?? post.handle).slice(0, 1).toUpperCase()
        )}
      </Link>

      <div>
        <div className="head">
          <Link href={`/u/${post.handle}`} className="name">
            {author?.name ?? post.handle}
          </Link>
          <span className="at">@{post.handle}</span>
          <span className="dot">·</span>
          <Link href={`/post/${post.ts}`} className="when">
            {relativeTime(post.ts)}
          </Link>
        </div>

        {post.reply_to && (
          <div className="muted small">
            replying to <Link href={`/post/${post.reply_to}`} className="tag">a post</Link>
          </div>
        )}

        <p className="body">{linkify(post.body)}</p>

        {post.image_key && <img className="media" src={mediaUrl(post.image_key)} alt="" />}

        <div className="actions">
          <Link href={`/post/${post.ts}`} className="muted small" style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px" }}>
            ↩ {counts.replies || ""}
          </Link>
          <button
            className={`repost ${reposted ? "on" : ""}`}
            disabled={!session || busy}
            title={session ? "Repost" : "Sign in to repost"}
            onClick={() => act(() => toggleRepost(post, session!.email, reposted))}
          >
            ⇄ {counts.reposts || ""}
          </button>
          <button
            className={`like ${liked ? "on" : ""}`}
            disabled={!session || busy}
            title={session ? "Like" : "Sign in to like"}
            onClick={() => act(() => toggleLike(post, session!.email, liked))}
          >
            {liked ? "♥" : "♡"} {counts.likes || ""}
          </button>
          <button
            className={`save ${saved ? "on" : ""}`}
            disabled={!session || busy}
            title={session ? "Bookmark" : "Sign in to bookmark"}
            onClick={() => act(() => toggleBookmark(post, session!.email, saved))}
          >
            {saved ? "★" : "☆"}
          </button>
          {mine && showAnalytics && (
            <button onClick={loadAnalytics} title="Views over time — only you can see this">
              ▤ {views ? views.total : ""}
            </button>
          )}
          {mine && (
            <button
              title="Delete"
              disabled={busy}
              onClick={() => {
                if (confirm("Delete this post?")) act(() => deletePost(post, session!.email));
              }}
            >
              ✕
            </button>
          )}
        </div>

        {openAnalytics && (
          <div className="box" style={{ marginTop: 10 }}>
            <div className="head" style={{ justifyContent: "space-between" }}>
              <strong className="small">Impressions · {views?.total ?? 0}</strong>
              <span className="engine">time-series</span>
            </div>
            {views && views.hourly.length > 0 ? (
              <div className="spark">
                {views.hourly.map((h) => (
                  <i key={h.ts} style={{ height: `${(h.value / max) * 100}%` }} />
                ))}
              </div>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>No views recorded yet.</p>
            )}
            <p className="muted small" style={{ margin: 0 }}>
              Hourly, last 48h. The series is private — only you can read your own post&apos;s reach.
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

/** Render #tags and @handles as links, leaving the rest as text. */
function linkify(body: string): React.ReactNode[] {
  return body.split(/(\s+)/).map((chunk, i) => {
    if (/^#[\p{L}\p{N}_]+$/u.test(chunk)) {
      return (
        <Link key={i} href={`/search?q=${encodeURIComponent(chunk)}`} className="tag">
          {chunk}
        </Link>
      );
    }
    if (/^@[a-z0-9_]+$/i.test(chunk)) {
      return (
        <Link key={i} href={`/u/${chunk.slice(1).toLowerCase()}`} className="tag">
          {chunk}
        </Link>
      );
    }
    return <span key={i}>{chunk}</span>;
  });
}
