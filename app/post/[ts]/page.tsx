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
  const [replies, setReplies] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [p, rs] = await Promise.all([postByTs(postTs), repliesTo(postTs)]);
    setPost(p);
    setReplies(rs);
    setLoading(false);
  }, [postTs]);

  useEffect(() => {
    load();
  }, [load]);

  const all = post ? [post, ...replies] : replies;
  const state = useFeedData(all);

  if (loading) return <Spinner />;
  if (!post) {
    return (
      <>
        <div className="topbar"><Link href="/" aria-label="Back"><IconBack size={22} /></Link><h1>Post</h1></div>
        <p className="center muted">This post is gone.</p>
      </>
    );
  }

  return (
    <>
      <div className="topbar">
        <Link href="/" aria-label="Back"><IconBack size={22} /></Link>
        <h1>Post</h1>
      </div>
      <Feed posts={[post]} state={state} onChanged={load} showAnalytics detail />
      {session && <Composer replyTo={{ ts: post.ts, owner: post.owner }} placeholder="Post your reply" onPosted={load} />}
      <Feed posts={replies} state={state} onChanged={load} empty="No replies yet." showAnalytics={false} />
    </>
  );
}
