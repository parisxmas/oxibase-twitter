"use client";

// A thread: the post, then its replies. A reply is a post whose `reply_to`
// carries the parent's timestamp — no separate collection, so the same rules
// and the same realtime stream cover both.

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/session";
import { postByTs, repliesTo, repliesToMany } from "@/lib/data";
import type { Post } from "@/lib/types";
import { Composer } from "../../composer";
import { Feed, useFeedData } from "../../feed";
import { Spinner } from "../../loading-ui";
import { IconBack } from "../../icons";

/** Enough to show the conversation without turning the page into all of it. */
const NESTED_SHOWN = 3;

export default function Thread({ params }: { params: Promise<{ ts: string }> }) {
  const { ts } = use(params);
  const postTs = Number(ts);
  const { session } = useSession();
  const [post, setPost] = useState<Post | null>(null);
  /** The conversation above this post, oldest first. */
  const [ancestors, setAncestors] = useState<Post[]>([]);
  const [replies, setReplies] = useState<Post[]>([]);
  /** A reply's own replies, by parent timestamp. One level: deeper is a thread
   *  of its own, which is what opening that reply gives you. */
  const [nested, setNested] = useState<Record<number, Post[]>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [p, rs] = await Promise.all([postByTs(postTs), repliesTo(postTs)]);
    setPost(p);
    setReplies(rs);

    // The replies of those replies, so a conversation reads as one. Without
    // them a reply showed a count and nothing else: the only way to see them
    // was to guess that the count was a link.
    const grandchildren = await repliesToMany(rs.map((r) => r.ts));
    const byParent: Record<number, Post[]> = {};
    for (const g of grandchildren) {
      if (g.reply_to == null) continue;
      (byParent[g.reply_to] ??= []).push(g);
    }
    setNested(byParent);

    // Walk up the chain so a reply is read in context, as a thread should be.
    // Bounded, so a malformed chain cannot loop.
    const chain: Post[] = [];
    let cursor = p?.reply_to ?? null;
    for (let i = 0; cursor && i < 10; i++) {
      const parent = await postByTs(cursor);
      if (!parent) break;
      chain.unshift(parent);
      cursor = parent.reply_to ?? null;
    }
    setAncestors(chain);
    setLoading(false);
  }, [postTs]);

  useEffect(() => {
    load();
  }, [load]);

  const nestedAll = Object.values(nested).flat();
  const all = post ? [...ancestors, post, ...replies, ...nestedAll] : [...replies, ...nestedAll];
  const state = useFeedData(all);

  if (loading) return <Spinner />;
  if (!post) {
    return (
      <>
        <div className="topbar">
          <Link href="/" aria-label="Back"><IconBack size={22} /></Link>
          <h1>Post</h1>
        </div>
        <p className="center muted">This post is gone.</p>
      </>
    );
  }

  return (
    <>
      <div className="topbar">
        <Link href="/" aria-label="Back"><IconBack size={22} /></Link>
        <h1>{ancestors.length > 0 ? "Thread" : "Post"}</h1>
      </div>

      {/* What came before, in order. */}
      {ancestors.length > 0 && (
        <div className="ancestors">
          <Feed posts={ancestors} state={state} onChanged={load} showAnalytics={false} />
        </div>
      )}

      <Feed posts={[post]} state={state} onChanged={load} showAnalytics detail />

      {session ? (
        <Composer
          replyTo={{ ts: post.ts, owner: post.owner, handle: post.handle }}
          placeholder={`Reply to @${post.handle}`}
          onPosted={load}
        />
      ) : (
        <p className="center muted small">
          <Link href="/login" className="tag">Sign in</Link> to reply.
        </p>
      )}

      {replies.length > 0 && (
        <div className="muted small" style={{ padding: "12px 16px 0" }}>
          {replies.length} {replies.length === 1 ? "reply" : "replies"}
        </div>
      )}
      {replies.length === 0 ? (
        <p className="center muted">No replies yet — be the first.</p>
      ) : (
        replies.map((r) => {
          const kids = nested[r.ts] ?? [];
          const shown = kids.slice(0, NESTED_SHOWN);
          return (
            <div key={r.ts}>
              <Feed posts={[r]} state={state} onChanged={load} showAnalytics={false} />
              {shown.length > 0 && (
                <div className="nested">
                  <Feed posts={shown} state={state} onChanged={load} showAnalytics={false} />
                  {kids.length > shown.length && (
                    <Link href={`/post/${r.ts}`} prefetch={false} className="tag nested-more">
                      Show all {kids.length} replies
                    </Link>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </>
  );
}
