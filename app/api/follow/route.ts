// The follow graph.
//
//   GET    /api/follow?who=<email>   — who they follow, who follows them,
//                                      and suggestions (a self-join)
//   POST   /api/follow  { followee }
//   DELETE /api/follow?followee=…
//
// It is a SQL table, not a collection, because that is what a graph is: the
// interesting questions are joins and aggregates. SQL has no per-row policy,
// so the data plane only accepts table writes from a service key — which makes
// this route the place where the per-user rule lives: the follower is always
// the caller's verified identity, never a value from the request.

import { verifyCaller, service } from "@/lib/server";

async function sql(text: string, params: unknown[] = []) {
  const res = await service("POST", "/api/sql", {
    body: JSON.stringify({ sql: text, params }),
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error((await res.text()).slice(0, 200));
  const out = (await res.json()) as { results?: { rows?: unknown[][] }[] };
  return out.results?.[0]?.rows ?? [];
}

export async function GET(req: Request) {
  const who = new URL(req.url).searchParams.get("who") ?? "";
  if (!who) return Response.json({ error: "who is required" }, { status: 400 });
  try {
    const [following, followers, suggestions] = await Promise.all([
      sql("SELECT followee FROM follows WHERE follower = ?", [who]),
      sql("SELECT follower FROM follows WHERE followee = ?", [who]),
      // "People followed by people you follow" — the self-join that makes this
      // relational rather than a pile of documents.
      sql(
        `SELECT b.followee, COUNT(*) AS shared
           FROM follows a
           JOIN follows b ON b.follower = a.followee
          WHERE a.follower = ? AND b.followee <> ?
          GROUP BY b.followee
          ORDER BY shared DESC
          LIMIT 5`,
        [who, who],
      ),
    ]);
    return Response.json({
      following: following.map((r) => String(r[0])),
      followers: followers.map((r) => String(r[0])),
      suggestions: suggestions.map((r) => ({ owner: String(r[0]), shared: Number(r[1]) })),
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const caller = await verifyCaller(req);
  if (!caller) return Response.json({ error: "sign in to follow" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { followee?: string } | null;
  const followee = (body?.followee ?? "").trim();
  if (!followee) return Response.json({ error: "followee is required" }, { status: 400 });
  if (followee === caller.email) {
    return Response.json({ error: "you already have your own attention" }, { status: 400 });
  }
  try {
    const existing = await sql("SELECT id FROM follows WHERE follower = ? AND followee = ?", [
      caller.email,
      followee,
    ]);
    if (existing.length === 0) {
      await sql("INSERT INTO follows (follower, followee, created_at) VALUES (?, ?, ?)", [
        caller.email,
        followee,
        Date.now(),
      ]);
    }
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

export async function DELETE(req: Request) {
  const caller = await verifyCaller(req);
  if (!caller) return Response.json({ error: "sign in" }, { status: 401 });
  const followee = new URL(req.url).searchParams.get("followee") ?? "";
  if (!followee) return Response.json({ error: "followee is required" }, { status: 400 });
  try {
    // Scoped to the caller: the follower column never comes from the request.
    await sql("DELETE FROM follows WHERE follower = ? AND followee = ?", [caller.email, followee]);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
