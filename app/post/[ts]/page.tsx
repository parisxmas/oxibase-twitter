"use client";

// A thread: the post, then its replies. A reply is a post whose `reply_to`
// carries the parent's timestamp — no separate collection, so the same rules
// and the same realtime stream cover both.

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/session";
import { postByTs, repliesTo } from "@/lib/data";
import type { Post } from "@/lib/types";
import { Composer } from "../../composer";
import { Feed, useFeedData } from "../../feed";
import { Spinner } from "../../loading-ui";
import { IconBack } from "../../icons";

export default function Thread({ params }: { params: Promise<{ ts: string }> }) {
  const { ts } = use(params);
  const postTs = Number(ts);
  const { session } = useSession();
  const [post, setPost] = useState<Post | null>(null);
  /** The conversation above this post, oldest first. */
  const [ancestors, setAncestors] = useState<Post[]>([]);
  const [replies, setReplies] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [p, rs] = await Promise.all([postByTs(postTs), repliesTo(postTs)]);
    setPost(p);
    setReplies(rs);

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

  const all = post ? [...ancestors, post, ...replies] : replies;
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
      <Feed
        posts={replies}
        state={state}
        onChanged={load}
        empty="No replies yet — be the first."
        showAnalytics={false}
      />
    </>
  );
}
