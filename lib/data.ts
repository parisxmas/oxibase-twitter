"use client";

// Everything the UI reads and writes, in one place.
//
// All of it runs in the browser with the anon key, or with the signed-in
// user's token — the security rules decide what is allowed. The three things
// a browser key cannot do (upload an image, append an impression, change the
// follow graph) live in route handlers instead; see app/api.

import { dataFetch, oxibase } from "./oxibase";
import type { Bookmark, Like, Notification, Post, Profile, Repost } from "./types";
import { defaultHandle, parseTags } from "./types";

const db = () => oxibase();

// ── Posts ───────────────────────────────────────────────────────────────────

/**
 * A page of the timeline, newest first: **top-level posts only**.
 *
 * Replies are conversation, and a feed of them reads as somebody else's inbox —
 * they are shown where they make sense, in the thread and under a profile's
 * "Posts & replies" tab. This holds whether or not anyone is signed in, so the
 * timeline is the same thing to everyone rather than quietly changing shape.
 *
 * Paged by `ts` rather than by offset: a cursor cannot skip or repeat a row
 * when something is posted while you are reading, which an OFFSET can.
 */
export async function timeline(
  limit = 20,
  before?: number,
  owners?: string[],
): Promise<Post[]> {
  // Restricting to a set of authors happens in the query, not after it.
  // Filtering a page of twenty down to "people you follow" hides everything
  // further back: an empty screen would mean "none in the last twenty",
  // not "none at all".
  if (owners && owners.length === 0) return [];
  let q = db().from("posts").select("*").is("reply_to", null);
  if (owners) q = q.in("owner", owners);
  if (before) q = q.lt("ts", before);
  const { data } = await q.order("ts", { ascending: false }).limit(limit);
  return (data ?? []) as Post[];
}

export async function postsByHandle(
  handle: string,
  limit = 20,
  before?: number,
  withReplies = false,
): Promise<Post[]> {
  let q = db().from("posts").select("*").eq("handle", handle);
  if (!withReplies) q = q.is("reply_to", null);
  if (before) q = q.lt("ts", before);
  const { data } = await q.order("ts", { ascending: false }).limit(limit);
  return (data ?? []) as Post[];
}

/**
 * Replies to any of `parents`, in one request rather than one per reply — a
 * thread page needs the replies *of* its replies to show a conversation, and
 * asking per reply would be a query per row on screen.
 */
export async function repliesToMany(parents: number[]): Promise<Post[]> {
  if (parents.length === 0) return [];
  const { data } = await db()
    .from("posts")
    .select("*")
    .in("reply_to", parents)
    .order("ts", { ascending: true })
    .limit(200);
  return (data ?? []) as Post[];
}

/**
 * Exactly the posts with these timestamps.
 *
 * Bookmarks used to be resolved by downloading the newest 200 posts and keeping
 * the ones that matched, which quietly lost two kinds of bookmark: anything
 * older than those 200, and **every reply**, because the timeline query is
 * top-level posts only. Asked for by id, neither can happen.
 *
 * Chunked so a long list cannot produce a URL nobody will accept.
 */
export async function postsByTsList(list: number[]): Promise<Post[]> {
  const ids = [...new Set(list)];
  if (ids.length === 0) return [];
  const out: Post[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await db()
      .from("posts")
      .select("*")
      .in("ts", ids.slice(i, i + 100))
      .limit(100);
    out.push(...((data ?? []) as Post[]));
  }
  return out;
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
  // Ranked first: BM25 puts the best match on top, and a post using the term
  // twice outranks one using it once — which a substring scan cannot do at all.
  // The engine says so explicitly when a collection has no text index yet, so
  // the old substring match stays as the fallback rather than a silent empty
  // result.
  const ranked = await db().textSearch("posts", q, { limit });
  if (!ranked.error && ranked.data) return ranked.data as unknown as Post[];

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
  reply_to_handle?: string | null;
  repost_of?: number | null;
}): Promise<{ post?: Post; error: string | null }> {
  const post: Post = {
    owner: input.owner,
    handle: input.handle,
    body: input.body,
    image_key: input.image_key ?? null,
    reply_to: input.reply_to ?? null,
    reply_to_handle: input.reply_to_handle ?? null,
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

/** Returns an error message, or null when the write went through. */
export async function toggleLike(post: Post, me: string, liked: boolean): Promise<string | null> {
  if (liked) {
    const { error } = await db().from("likes").delete().eq("post_ts", post.ts).eq("owner", me);
    return error?.message ?? null;
  }
  const { error } = await db().from("likes").insert({ owner: me, post_ts: post.ts });
  if (error) return error.message;
  // The notification is a courtesy, not part of the like: it must not be able
  // to fail the action the reader took.
  notify(post.owner, me, "like", post.ts).catch(() => {});
  return null;
}

export async function toggleRepost(post: Post, me: string, reposted: boolean): Promise<string | null> {
  if (reposted) {
    const { error } = await db().from("reposts").delete().eq("post_ts", post.ts).eq("owner", me);
    return error?.message ?? null;
  }
  const { error } = await db()
    .from("reposts")
    .insert({ owner: me, post_ts: post.ts, ts: Date.now() });
  if (error) return error.message;
  notify(post.owner, me, "repost", post.ts).catch(() => {});
  return null;
}

// ── Bookmarks (yours alone, by rule) ────────────────────────────────────────

export async function myBookmarks(): Promise<Bookmark[]> {
  // No filter here on purpose: the read rule returns only your own rows.
  const { data } = await db().from("bookmarks").select("*").order("ts", { ascending: false });
  return (data ?? []) as Bookmark[];
}

export async function toggleBookmark(post: Post, me: string, saved: boolean): Promise<string | null> {
  const { error } = saved
    ? await db().from("bookmarks").delete().eq("post_ts", post.ts).eq("owner", me)
    : await db().from("bookmarks").insert({ owner: me, post_ts: post.ts, ts: Date.now() });
  return error?.message ?? null;
}

// ── Profiles ────────────────────────────────────────────────────────────────

// Who is who: needed by the feed (author names and avatars) and by the aside,
// which mount together — and again on every navigation, because each route
// mounts its own feed. Concurrent callers share one request, and the answer is
// held briefly afterwards: names and avatars change far more slowly than people
// click, so a page change should not re-download the list. The window is short
// enough that an edited profile appears almost at once, and a viewer's own edits
// are read straight from the row they just wrote.
const PROFILES_TTL_MS = 30_000;
let profilesInFlight: Promise<Profile[]> | null = null;
let profilesCache: { at: number; rows: Profile[] } | null = null;

export function profiles(): Promise<Profile[]> {
  if (profilesCache && Date.now() - profilesCache.at < PROFILES_TTL_MS) {
    return Promise.resolve(profilesCache.rows);
  }
  if (profilesInFlight) return profilesInFlight;
  const req = (async () => {
    try {
      const { data } = await db().from("profiles").select("*").limit(200);
      const rows = (data ?? []) as Profile[];
      profilesCache = { at: Date.now(), rows };
      return rows;
    } finally {
      profilesInFlight = null;
    }
  })();
  profilesInFlight = req;
  return req;
}

/**
 * The signed-in reader's own profile, held for the same short window. The rail
 * wants their handle and the composer wants their avatar, and both mount on
 * every page — one row, fetched once.
 */
let viewerCache: { owner: string; at: number; row: Profile | null } | null = null;

export async function viewerProfile(owner: string): Promise<Profile | null> {
  if (viewerCache && viewerCache.owner === owner && Date.now() - viewerCache.at < PROFILES_TTL_MS) {
    return viewerCache.row;
  }
  const row = await profileByOwner(owner);
  viewerCache = { owner, at: Date.now(), row };
  return row;
}

/** Drop the cached lookups — after saving a profile, so the change shows at once. */
export function invalidateProfiles(): void {
  profilesCache = null;
  viewerCache = null;
}

export async function profileByHandle(handle: string): Promise<Profile | null> {
  const { data } = await db().from("profiles").select("*").eq("handle", handle).limit(1);
  return ((data ?? [])[0] as Profile) ?? null;
}

/**
 * The profile of someone who has posted but never saved one.
 *
 * A profile row is only written when you edit your profile, so an account that
 * signed up and started posting has none — and had no page at all ("No such
 * account"), even though its posts were right there in the timeline. That also
 * meant nobody could follow them: the profile page is the only place with a
 * follow button. Posts carry their author's handle, so the identity is
 * recoverable from them.
 */
export async function derivedProfileByHandle(handle: string): Promise<Profile | null> {
  const { data } = await db()
    .from("posts")
    .select("owner,ts")
    .eq("handle", handle)
    .order("ts", { ascending: true })
    .limit(1);
  const row = (data ?? [])[0] as { owner?: string; ts?: number } | undefined;
  if (!row?.owner) return null;
  return {
    owner: row.owner,
    handle,
    name: row.owner.split("@")[0],
    bio: "",
    avatar_key: null,
    created_at: row.ts ?? Date.now(),
  };
}

/**
 * Give a signed-in user the profile row they should always have had. A no-op
 * when it exists, so it is safe to call on every sign-in — without it, an
 * account is unreachable at /u/<handle> until it happens to visit Settings.
 */
export async function ensureProfile(email: string): Promise<void> {
  if (await profileByOwner(email)) return;
  const base = defaultHandle(email);
  let handle = base;
  for (let n = 2; n <= 6; n++) {
    const taken = await profileByHandle(handle);
    if (!taken || taken.owner === email) break;
    handle = `${base}${n}`;
  }
  await db().from("profiles").insert({
    owner: email,
    handle,
    name: email.split("@")[0],
    bio: "",
    avatar_key: null,
    created_at: Date.now(),
  });
}

export async function profileByOwner(owner: string): Promise<Profile | null> {
  const { data } = await db().from("profiles").select("*").eq("owner", owner).limit(1);
  return ((data ?? [])[0] as Profile) ?? null;
}

/**
 * Persist just the avatar. Adding a photo is its own act — it used to live only
 * in component state until "Save profile" was pressed, so the picture appeared,
 * looked saved, and was lost on navigation (leaving the uploaded file orphaned
 * in storage).
 */
export async function setAvatarKey(owner: string, avatar_key: string | null): Promise<string | null> {
  invalidateProfiles();
  const { error } = await db().from("profiles").update({ avatar_key }).eq("owner", owner);
  return error?.message ?? null;
}

export async function saveProfile(p: Profile): Promise<string | null> {
  invalidateProfiles();
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
