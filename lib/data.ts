"use client";

// Everything the UI reads and writes, in one place.
//
// All of it runs in the browser with the anon key, or with the signed-in
// user's token — the security rules decide what is allowed. The three things
// a browser key cannot do (upload an image, append an impression, change the
// follow graph) live in route handlers instead; see app/api.

import { dataFetch, oxibase } from "./oxibase";
import type { Bookmark, Like, Notification, Post, Profile, Repost } from "./types";
import { parseTags } from "./types";

const db = () => oxibase();

// ── Posts ───────────────────────────────────────────────────────────────────

/**
 * A page of top-level posts, newest first.
 *
 * Paged by `ts` rather than by offset: a cursor cannot skip or repeat a row
 * when something is posted while you are reading, which an OFFSET can. Replies
 * are excluded by the server (`reply_to is null`) so a page of twenty is
 * twenty visible posts, not twenty rows of which some are hidden.
 */
export async function timeline(limit = 20, before?: number): Promise<Post[]> {
  let q = db().from("posts").select("*").is("reply_to", null);
  if (before) q = q.lt("ts", before);
  const { data } = await q.order("ts", { ascending: false }).limit(limit);
  return (data ?? []) as Post[];
}

export async function postsByHandle(handle: string, limit = 20, before?: number): Promise<Post[]> {
  let q = db().from("posts").select("*").eq("handle", handle);
  if (before) q = q.lt("ts", before);
  const { data } = await q.order("ts", { ascending: false }).limit(limit);
  return (data ?? []) as Post[];
}

export async function postByTs(ts: number): Promise<Post | null> {
  const { data } = await db().from("posts").select("*").eq("ts", ts).limit(1);
  return ((data ?? [])[0] as Post) ?? null;
}

export async function repliesTo(ts: number): Promise<Post[]> {
  const { data } = await db()
    .from("posts")
    .select("*")
    .eq("reply_to", ts)
    .order("ts", { ascending: true })
    .limit(100);
  return (data ?? []) as Post[];
}

/** Posts whose body matches, or that carry the tag when the query is `#tag`. */
export async function searchPosts(query: string, limit = 40): Promise<Post[]> {
  const q = query.trim();
  if (!q) return [];
  if (q.startsWith("#")) {
    const { data } = await db()
      .from("posts")
      .select("*")
      .contains("tags", [q.slice(1).toLowerCase()])
      .order("ts", { ascending: false })
      .limit(limit);
    return (data ?? []) as Post[];
  }
  const { data } = await db()
    .from("posts")
    .select("*")
    .ilike("body", `%${q}%`)
    .order("ts", { ascending: false })
    .limit(limit);
  return (data ?? []) as Post[];
}

export async function createPost(input: {
  owner: string;
  handle: string;
  body: string;
  image_key?: string | null;
  reply_to?: number | null;
  repost_of?: number | null;
}): Promise<{ post?: Post; error: string | null }> {
  const post: Post = {
    owner: input.owner,
    handle: input.handle,
    body: input.body,
    image_key: input.image_key ?? null,
    reply_to: input.reply_to ?? null,
    repost_of: input.repost_of ?? null,
    tags: parseTags(input.body),
    ts: Date.now(),
  };
  const { error } = await db().from("posts").insert(post);
  return { post: error ? undefined : post, error: error?.message ?? null };
}

export async function deletePost(post: Post, me: string): Promise<string | null> {
  // The rule (`delete: auth.username == doc.owner`) is what enforces this; the
  // check here only keeps the UI honest.
  if (post.owner !== me) return "not yours to delete";
  const { error } = await db().from("posts").delete().eq("ts", post.ts).eq("owner", me);
  if (error) return error.message;
  await db().from("likes").delete().eq("post_ts", post.ts).eq("owner", me);
  return null;
}

// ── Reactions ───────────────────────────────────────────────────────────────

/**
 * Count rows per value of `field`, server-side.
 *
 * The alternative is to download the rows and count them in the browser, or —
 * worse — ask once per post, which is one request per row on screen. A `$group`
 * is one request whose response is the counts themselves, so it does not grow
 * with the number of likes, only with the number of distinct posts.
 */
async function countBy(
  collection: string,
  field: string,
  match?: Record<string, unknown>,
): Promise<Map<number, number>> {
  const pipeline = [
    ...(match ? [{ $match: match }] : []),
    { $group: { _id: `$${field}`, n: { $sum: 1 } } },
  ];
  const res = await dataFetch(`/api/${collection}/aggregate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pipeline }),
  });
  if (!res.ok) return new Map();
  const rows = (await res.json()) as { _id: number | null; n: number }[];
  const out = new Map<number, number>();
  for (const r of rows) if (typeof r._id === "number") out.set(r._id, r.n);
  return out;
}

export const likeCounts = () => countBy("likes", "post_ts");
export const repostCounts = () => countBy("reposts", "post_ts");
/** Replies are posts too, so their count is a group over `reply_to`. */
export const replyCounts = () => countBy("posts", "reply_to", { reply_to: { $ne: null } });

/** Just the viewer's own reactions — a filtered read, not the whole table. */
export async function myLikes(me: string): Promise<number[]> {
  const { data } = await db().from("likes").select("post_ts").eq("owner", me).limit(1000);
  return ((data ?? []) as Like[]).map((l) => l.post_ts);
}

export async function myReposts(me: string): Promise<number[]> {
  const { data } = await db().from("reposts").select("post_ts").eq("owner", me).limit(1000);
  return ((data ?? []) as Repost[]).map((r) => r.post_ts);
}

export async function toggleLike(post: Post, me: string, liked: boolean): Promise<void> {
  if (liked) {
    await db().from("likes").delete().eq("post_ts", post.ts).eq("owner", me);
  } else {
    await db().from("likes").insert({ owner: me, post_ts: post.ts });
    await notify(post.owner, me, "like", post.ts);
  }
}

export async function toggleRepost(post: Post, me: string, reposted: boolean): Promise<void> {
  if (reposted) {
    await db().from("reposts").delete().eq("post_ts", post.ts).eq("owner", me);
  } else {
    await db().from("reposts").insert({ owner: me, post_ts: post.ts, ts: Date.now() });
    await notify(post.owner, me, "repost", post.ts);
  }
}

// ── Bookmarks (yours alone, by rule) ────────────────────────────────────────

export async function myBookmarks(): Promise<Bookmark[]> {
  // No filter here on purpose: the read rule returns only your own rows.
  const { data } = await db().from("bookmarks").select("*").order("ts", { ascending: false });
  return (data ?? []) as Bookmark[];
}

export async function toggleBookmark(post: Post, me: string, saved: boolean): Promise<void> {
  if (saved) {
    await db().from("bookmarks").delete().eq("post_ts", post.ts).eq("owner", me);
  } else {
    await db().from("bookmarks").insert({ owner: me, post_ts: post.ts, ts: Date.now() });
  }
}

// ── Profiles ────────────────────────────────────────────────────────────────

export async function profiles(): Promise<Profile[]> {
  const { data } = await db().from("profiles").select("*").limit(200);
  return (data ?? []) as Profile[];
}

export async function profileByHandle(handle: string): Promise<Profile | null> {
  const { data } = await db().from("profiles").select("*").eq("handle", handle).limit(1);
  return ((data ?? [])[0] as Profile) ?? null;
}

export async function profileByOwner(owner: string): Promise<Profile | null> {
  const { data } = await db().from("profiles").select("*").eq("owner", owner).limit(1);
  return ((data ?? [])[0] as Profile) ?? null;
}

export async function saveProfile(p: Profile): Promise<string | null> {
  const existing = await profileByOwner(p.owner);
  const { error } = existing
    ? await db().from("profiles").update(p).eq("owner", p.owner)
    : await db().from("profiles").insert(p);
  return error?.message ?? null;
}

// ── Notifications (readable only by their recipient, by rule) ───────────────

export async function myNotifications(): Promise<Notification[]> {
  const { data } = await db()
    .from("notifications")
    .select("*")
    .order("ts", { ascending: false })
    .limit(50);
  return (data ?? []) as Notification[];
}

async function notify(
  recipient: string,
  actor: string,
  kind: Notification["kind"],
  post_ts?: number,
): Promise<void> {
  if (recipient === actor) return; // no notifications for your own actions
  const me = await profileByOwner(actor);
  await db().from("notifications").insert({
    owner: recipient,
    kind,
    actor,
    actor_handle: me?.handle ?? actor.split("@")[0],
    post_ts: post_ts ?? null,
    ts: Date.now(),
    read: false,
  });
}

export async function markNotificationsRead(me: string): Promise<void> {
  await db().from("notifications").update({ read: true }).eq("owner", me).eq("read", false);
}

export { notify };
