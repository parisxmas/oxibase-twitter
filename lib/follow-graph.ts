// The follow graph, read straight from the data plane.
//
// `follows` is a SQL table, so a *write* has to go through /api/follow with the
// service key — SQL has no per-row policy, which is exactly why the browser key
// may not write it. A **read** is a different matter: a SELECT is something the
// anon key is allowed to run, gated per referenced table like any other read.
//
// Routing reads through the app's own route was a needless detour. The function
// runs in one region and the database in another, so the round trip cost ~370ms
// where the same query answers in ~95ms straight from the browser. Worse, three
// components each asked for it independently on one page load.
//
// So: one in-flight request per address, memoised, and invalidated when the
// viewer follows or unfollows someone.

import { oxibase } from "./oxibase";

export type FollowGraph = {
  following: string[];
  followers: string[];
  suggestions: { owner: string; shared: number }[];
};

const EMPTY: FollowGraph = { following: [], followers: [], suggestions: [] };

const cache = new Map<string, FollowGraph>();
const inFlight = new Map<string, Promise<FollowGraph>>();

export function followGraph(email: string): Promise<FollowGraph> {
  if (!email) return Promise.resolve(EMPTY);
  const hit = cache.get(email);
  if (hit) return Promise.resolve(hit);
  const running = inFlight.get(email);
  if (running) return running;

  const started = load(email)
    .then((graph) => {
      cache.set(email, graph);
      return graph;
    })
    .finally(() => inFlight.delete(email));
  inFlight.set(email, started);
  return started;
}

/** The cached copy, when there is one — lets a component render without a wait. */
export function cachedFollowGraph(email: string): FollowGraph | null {
  return cache.get(email) ?? null;
}

/** After a follow or unfollow: the next read fetches again. */
export function invalidateFollowGraph(email?: string): void {
  if (email) cache.delete(email);
  else cache.clear();
}

async function load(email: string): Promise<FollowGraph> {
  const db = oxibase();
  const [followingRes, followersRes, suggestionsRes] = await Promise.all([
    db.sql("SELECT followee FROM follows WHERE follower = ?", [email]),
    db.sql("SELECT follower FROM follows WHERE followee = ?", [email]),
    // "People followed by people you follow" — the self-join that makes this
    // relational rather than a pile of documents.
    db.sql(
      `SELECT b.followee, COUNT(*) AS shared
         FROM follows a
         JOIN follows b ON b.follower = a.followee
        WHERE a.follower = ? AND b.followee <> ?
        GROUP BY b.followee
        ORDER BY shared DESC
        LIMIT 5`,
      [email, email],
    ),
  ]);

  const rows = (res: { results: { rows?: unknown[][] }[] | null }) => res.results?.[0]?.rows ?? [];
  return {
    following: rows(followingRes).map((r) => String(r[0])),
    followers: rows(followersRes).map((r) => String(r[0])),
    suggestions: rows(suggestionsRes).map((r) => ({ owner: String(r[0]), shared: Number(r[1]) })),
  };
}
