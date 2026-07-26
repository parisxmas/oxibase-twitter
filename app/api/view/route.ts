// POST /api/view  { post_ts }  or  { post_ts: [ ... ] }  — record posts as seen.
//
// Impressions are the time-series part of a microblog: one point per view,
// aggregated into a chart on the author's own analytics. A browser cannot
// append to a series (no per-row rules exist to adjudicate such a write), so
// it happens here. No caller check: a view by a signed-out reader is still a
// view, and the point carries no identity — only the post it belongs to.

import { service } from "@/lib/server";

/** A batch cap, so one request cannot ask for an unbounded write. */
const MAX_BATCH = 200;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { post_ts?: number | number[] }
    | null;

  // One or many: the client batches, older clients send a single number, and
  // both are the same write here.
  const raw = Array.isArray(body?.post_ts) ? body.post_ts : [body?.post_ts];
  const list = [...new Set(raw.map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  if (list.length === 0) {
    return Response.json({ error: "post_ts is required" }, { status: 400 });
  }
  if (list.length > MAX_BATCH) {
    return Response.json({ error: `at most ${MAX_BATCH} at a time` }, { status: 413 });
  }

  const now = Date.now();
  const res = await service("POST", "/rest/v1/impressions", {
    // One append for the whole batch. The tsdb profile takes an array of points
    // as readily as a single one, so N views cost one round trip instead of N.
    body: JSON.stringify(
      list.map((postTs) => ({
        ts: now,
        // A string value becomes a tag: the series is partitioned per post.
        post: String(postTs),
        views: 1,
      })),
    ),
    headers: { "Content-Type": "application/json", "Content-Profile": "tsdb" },
  });
  return Response.json({ ok: res.ok, counted: list.length }, { status: res.ok ? 201 : 502 });
}
