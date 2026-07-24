// POST /api/view  { post_ts }  — record that a post was seen.
//
// Impressions are the time-series part of a microblog: one point per view,
// aggregated into a chart on the author's own analytics. A browser cannot
// append to a series (no per-row rules exist to adjudicate such a write), so
// it happens here. No caller check: a view by a signed-out reader is still a
// view, and the point carries no identity — only the post it belongs to.

import { service } from "@/lib/server";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { post_ts?: number } | null;
  const postTs = Number(body?.post_ts);
  if (!Number.isFinite(postTs) || postTs <= 0) {
    return Response.json({ error: "post_ts is required" }, { status: 400 });
  }

  const res = await service("POST", "/rest/v1/impressions", {
    body: JSON.stringify({
      ts: Date.now(),
      // A string value becomes a tag: the series is partitioned per post.
      post: String(postTs),
      views: 1,
    }),
    headers: { "Content-Type": "application/json", "Content-Profile": "tsdb" },
  });
  return Response.json({ ok: res.ok }, { status: res.ok ? 201 : 502 });
}
