"use client";

import { use, useCallback, useEffect, useState } from "react";
import { mediaUrl } from "@/lib/oxibase";
import { useSession } from "@/lib/session";
import { postsByHandle, profileByHandle } from "@/lib/data";
import type { Post, Profile } from "@/lib/types";
import { Feed, useFeedData } from "../../feed";
import { Spinner } from "../../loading-ui";
import { usePagedPosts } from "../../use-paged";
import { FollowButton } from "../../follow-button";

export default function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = use(params);
  const { session } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [graph, setGraph] = useState<{ following: string[]; followers: string[] }>({ following: [], followers: [] });
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [withReplies, setWithReplies] = useState(false);
  const fetchPage = useCallback(
    (limit: number, before?: number) => postsByHandle(handle, limit, before, withReplies),
    [handle, withReplies],
  );
  const { posts, setPosts, loading, loadingMore, done, sentinel, reload } = usePagedPosts(fetchPage);

  const load = useCallback(async () => {
    const p = await profileByHandle(handle);
    setProfile(p);
    setLoadingProfile(false);
    reload();
    if (p) {
      const r = await fetch(`/api/follow?who=${encodeURIComponent(p.owner)}`);
      if (r.ok) setGraph(await r.json());
    }
  }, [handle, reload]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle]);

  const state = useFeedData(posts);
  const mine = session?.email === profile?.owner;

  if (loadingProfile) return <Spinner />;
  if (!profile) {
    return (
      <>
        <div className="topbar"><h1>@{handle}</h1></div>
        <p className="center muted">No such account.</p>
      </>
    );
  }

  return (
    <>
      <div className="topbar">
        <h1>{profile.name}</h1>
        <span className="muted small">{posts.length} posts</span>
      </div>

      <div style={{ padding: 16, borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div className="avatar" style={{ width: 72, height: 72, fontSize: 26 }}>
            {profile.avatar_key ? <img src={mediaUrl(profile.avatar_key)} alt="" /> : profile.name.slice(0, 1).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{profile.name}</div>
            <div className="muted">@{profile.handle}</div>
          </div>
          {mine ? (
            <a className="ghost" href="/settings" style={{ padding: "7px 15px", borderRadius: 999, border: "1px solid var(--line)" }}>
              Edit profile
            </a>
          ) : (
            <FollowButton target={profile.owner} onChanged={load} />
          )}
        </div>
        {profile.bio && <p style={{ marginBottom: 6 }}>{profile.bio}</p>}
        <div className="muted small" style={{ display: "flex", gap: 16 }}>
          <span><strong style={{ color: "var(--ink)" }}>{graph.following.length}</strong> following</span>
          <span><strong style={{ color: "var(--ink)" }}>{graph.followers.length}</strong> followers</span>
          <span className="engine">sql</span>
        </div>
      </div>

      <div className="tabs">
        <button className={withReplies ? "" : "on"} onClick={() => setWithReplies(false)}>
          Posts
        </button>
        <button className={withReplies ? "on" : ""} onClick={() => setWithReplies(true)}>
          Posts &amp; replies
        </button>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <>
          <Feed
            posts={posts}
            state={state}
            onChanged={load}
            onRemoved={(ts) => setPosts((prev) => prev.filter((p) => p.ts !== ts))}
            empty="No posts yet."
          />
          <div ref={sentinel} />
          {loadingMore && <Spinner />}
          {done && posts.length > 0 && <p className="center muted small">That&apos;s everything.</p>}
        </>
      )}
    </>
  );
}
