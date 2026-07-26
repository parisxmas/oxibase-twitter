"use client";

// Impressions, batched.
//
// Every post card reports itself once, when it scrolls into view — which meant
// one request per post: scrolling five pages of the timeline cost 28 of them for
// 100 posts, while the posts themselves took 4. Reporting is not urgent and the
// points are identical in shape, so they are collected for a moment and sent
// together.
//
// Nothing here retries: a lost impression is a lost impression, and it is not
// worth a queue on disk or a second request to find out.

const FLUSH_AFTER_MS = 800;
/** Send early once this many are waiting, so a fast scroll does not hold a pile. */
const FLUSH_AT = 20;

const pending = new Set<number>();
/** Reported this page-load, so a card re-entering view does not count twice. */
const reported = new Set<number>();
let timer: ReturnType<typeof setTimeout> | null = null;
let armed = false;

function send(list: number[], viaBeacon = false) {
  if (list.length === 0) return;
  const body = JSON.stringify({ post_ts: list });
  // On the way out of the page, a normal fetch is cancelled — a beacon is not.
  // The endpoint takes no auth, so it is eligible for one.
  if (viaBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/view", new Blob([body], { type: "application/json" }));
    return;
  }
  fetch("/api/view", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

function flush(viaBeacon = false) {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const list = [...pending];
  pending.clear();
  send(list, viaBeacon);
}

/** Note that a post was seen. Sent with the others a moment later. */
export function recordView(postTs: number): void {
  if (reported.has(postTs)) return;
  reported.add(postTs);
  pending.add(postTs);

  // Whatever is still waiting when the tab is hidden or unloaded should go now,
  // or a reader who scrolls and leaves is never counted.
  if (!armed && typeof document !== "undefined") {
    armed = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush(true);
    });
    window.addEventListener("pagehide", () => flush(true));
  }

  if (pending.size >= FLUSH_AT) return flush();
  if (!timer) timer = setTimeout(() => flush(), FLUSH_AFTER_MS);
}
