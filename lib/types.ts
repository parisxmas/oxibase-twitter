// The shapes stored in the project.
//
// `ts` (milliseconds) is a post's identity: it is unique per author per
// millisecond, sorts naturally, and lets a reply or a like point at a post
// without a round-trip to learn its id.

export type Post = {
  _id?: number;
  owner: string;
  handle: string;
  body: string;
  image_key?: string | null;
  ts: number;
  /** The `ts` of the post this replies to, if any. */
  reply_to?: number | null;
  /** Denormalised so "Replying to @x" needs no second read. */
  reply_to_handle?: string | null;
  /** The `ts` of the post this reposts, if any (the body is then empty). */
  repost_of?: number | null;
  /** Lower-cased tags parsed out of the body, for search. */
  tags?: string[];
};

export type Profile = {
  _id?: number;
  owner: string;
  handle: string;
  name: string;
  bio?: string;
  avatar_key?: string | null;
  created_at: number;
};

export type Like = { _id?: number; owner: string; post_ts: number };
export type Repost = { _id?: number; owner: string; post_ts: number; ts: number };
export type Bookmark = { _id?: number; owner: string; post_ts: number; ts: number };

export type Notification = {
  _id?: number;
  /** The recipient — the read rule keys off this. */
  owner: string;
  kind: "like" | "reply" | "repost" | "follow";
  actor: string;
  actor_handle: string;
  post_ts?: number | null;
  ts: number;
  read?: boolean;
};

export const MAX_POST_LENGTH = 280;

/** `#tag` mentions, lower-cased and de-duplicated. */
export function parseTags(body: string): string[] {
  const found = body.match(/#[\p{L}\p{N}_]{1,40}/gu) ?? [];
  return [...new Set(found.map((t) => t.slice(1).toLowerCase()))];
}

/** A handle from an email, for accounts that never set one. */
export function defaultHandle(email: string): string {
  return email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 20) || "user";
}

export function relativeTime(ts: number): string {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 604800) return `${Math.round(s / 86400)}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
