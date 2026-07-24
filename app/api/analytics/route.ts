// GET /api/analytics?post_ts=… — impressions for one of *your* posts.
//
// The series is private (`read: false`), because a time-series has no
// row-level policy: readable at all would mean readable by everyone. So the
// read happens here, and only for the post's author — verified from the token,
// then checked against the post itself.

import { verifyCaller, service } from "@/lib/server";

const HOUR_MS = 3_600_000;

export async function GET(req: Request) {
  const caller = await verifyCaller(req);
  if (!caller) return Response.json({ error: "sign in" }, { status: 401 });

  const postTs = Number(new URL(req.url).searchParams.get("post_ts"));
  if (!Number.isFinite(postTs) || postTs <= 0) {
    return Response.json({ error: "post_ts is required" }, { status: 400 });
  }

  // Only the author may see a post's reach.
  const owner = await service("GET", `/rest/v1/posts?ts=eq.${postTs}&select=owner`);
  const rows = owner.ok ? ((await owner.json()) as { owner: string }[]) : [];
  if (rows[0]?.owner !== caller.email) {
    return Response.json({ error: "not your post" }, { status: 403 });
  }

  const qs = new URLSearchParams({
    select: "views",
    post: `eq.${postTs}`,
    ts: `gte.${Date.now() - 48 * HOUR_MS}`,
    agg: "sum",
    interval: String(HOUR_MS),
  });
  const res = await service("GET", `/rest/v1/impressions?${qs}`, {
    headers: { "Accept-Profile": "tsdb" },
  });
  if (!res.ok) return Response.json({ error: "could not read impressions" }, { status: 502 });
  const points = (await res.json()) as { ts: number; value: number | null }[];
  const clean = Array.isArray(points) ? points.filter((p) => p.value != null) : [];
  return Response.json({
    total: clean.reduce((n, p) => n + (p.value ?? 0), 0),
    hourly: clean,
  });
}
