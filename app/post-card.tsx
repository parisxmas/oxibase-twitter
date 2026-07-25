"use client";

// One post, with its actions. Used by every timeline in the app.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { mediaUrl } from "@/lib/oxibase";
import { useSession, authHeader } from "@/lib/session";
import { relativeTime, type Post, type Profile } from "@/lib/types";
import { deletePost, postByTs, toggleBookmark, toggleLike, toggleRepost } from "@/lib/data";
import { IconBookmark, IconChart, IconHeart, IconReply, IconRepost, IconTrash } from "./icons";
import { Lightbox } from "./lightbox";
import type { FeedState } from "./feed";

export type Counts = { likes: number; reposts: number; replies: number };

export function PostCard({
  post,
  author,
  counts,
  liked,
  reposted,
  saved,
  state,
  onRemoved,
  showAnalytics = false,
  detail = false,
}: {
  post: Post;
  author?: Profile | null;
  counts: Counts;
  liked: boolean;
  reposted: boolean;
  saved: boolean;
  /** Local reaction updates, so a like does not reload the timeline. */
  state: Pick<FeedState, "applyLike" | "applyRepost" | "applyBookmark">;
  onRemoved: (ts: number) => void;
  showAnalytics?: boolean;
  /** The single-post page: media may be taller there, as Twitter's is. */
  detail?: boolean;
}) {
  const { session } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [parentHandle, setParentHandle] = useState<string | null>(post.reply_to_handle ?? null);
  const [views, setViews] = useState<{ total: number; hourly: { ts: number; value: number }[] } | null>(null);
  const [openAnalytics, setOpenAnalytics] = useState(false);
  const [zoomed, setZoomed] = useState(false);
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

  // Older replies predate the denormalised handle; look it up once so the
  // "Replying to" line names a person rather than "a post".
  useEffect(() => {
    if (!post.reply_to || parentHandle) return;
    postByTs(post.reply_to).then((p) => p && setParentHandle(p.handle));
  }, [post.reply_to, parentHandle]);

  /**
   * Open the thread when the card is clicked — but not when the click was
   * meant for something inside it. A link, a button or a selection of text
   * should behave normally.
   */
  function openThread(e: React.MouseEvent) {
    if (detail) return;
    const el = e.target as HTMLElement;
    // Links, buttons, the image (which zooms) and icons keep their own click.
    if (el.closest("a, button, img, svg, dialog")) return;
    if (window.getSelection()?.toString()) return;
    router.push(`/post/${post.ts}`);
  }

  /**
   * Reactions are applied straight away and reverted if the write is refused.
   * The alternative — write, then refetch — makes the reader wait a round trip
   * to see their own click, and refetching the feed would throw away every
   * page they had scrolled through.
   */
  async function react(
    apply: (ts: number, on: boolean) => void,
    write: () => Promise<string | null>,
    on: boolean,
  ) {
    if (!session) return;
    apply(post.ts, on);
    setBusy(true);
    const error = await write().catch((e) => String(e));
    setBusy(false);
    if (error) apply(post.ts, !on); // the server said no; put it back
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
    <article
      className={`post ${detail ? "detail" : "clickable"}`}
      ref={ref as React.RefObject<HTMLElement>}
      onClick={openThread}
      onKeyDown={(e) => {
        if (!detail && (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
          e.preventDefault();
          router.push(`/post/${post.ts}`);
        }
      }}
      tabIndex={detail ? undefined : 0}
      role={detail ? undefined : "link"}
      aria-label={detail ? undefined : `Open post by ${post.handle}`}
    >
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
            Replying to{" "}
            {parentHandle ? (
              <Link href={`/u/${parentHandle}`} className="tag">
                @{parentHandle}
              </Link>
            ) : (
              <Link href={`/post/${post.reply_to}`} className="tag">
                a post
              </Link>
            )}
          </div>
        )}

        <p className="body">{linkify(post.body)}</p>

        {post.image_key && (
          <>
            <img
              className="media"
              src={mediaUrl(post.image_key)}
              alt=""
              onClick={(e) => {
                e.stopPropagation();
                setZoomed(true);
              }}
            />
            <Lightbox
              src={mediaUrl(post.image_key)}
              alt={`Image posted by @${post.handle}`}
              open={zoomed}
              onClose={() => setZoomed(false)}
            />
          </>
        )}

        <div className="actions">
          <Link href={`/post/${post.ts}`} className="muted small" style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px" }}>
            <IconReply size={19} /> {counts.replies || ""}
          </Link>
          <button
            className={`repost ${reposted ? "on" : ""}`}
            disabled={!session || busy}
            title={session ? "Repost" : "Sign in to repost"}
            onClick={() =>
              react(state.applyRepost, () => toggleRepost(post, session!.email, reposted), !reposted)
            }
          >
            <IconRepost size={19} /> {counts.reposts || ""}
          </button>
          <button
            className={`like ${liked ? "on" : ""}`}
            disabled={!session || busy}
            title={session ? "Like" : "Sign in to like"}
            onClick={() =>
              react(state.applyLike, () => toggleLike(post, session!.email, liked), !liked)
            }
          >
            <IconHeart size={19} filled={liked} /> {counts.likes || ""}
          </button>
          <button
            className={`save ${saved ? "on" : ""}`}
            disabled={!session || busy}
            title={session ? "Bookmark" : "Sign in to bookmark"}
            onClick={() =>
              react(state.applyBookmark, () => toggleBookmark(post, session!.email, saved), !saved)
            }
          >
            <IconBookmark size={19} filled={saved} />
          </button>
          {mine && showAnalytics && (
            <button onClick={loadAnalytics} title="Views over time — only you can see this">
              <IconChart size={19} /> {views ? views.total : ""}
            </button>
          )}
          {mine && (
            <button
              title="Delete"
              disabled={busy}
              onClick={async () => {
                if (!confirm("Delete this post?")) return;
                setBusy(true);
                const err = await deletePost(post, session!.email);
                setBusy(false);
                // Gone from the list in place; no refetch, no lost scroll.
                if (!err) onRemoved(post.ts);
              }}
            >
              <IconTrash size={19} />
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
