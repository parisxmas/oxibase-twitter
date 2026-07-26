// A limiter for this app's own route handlers.
//
// Those routes hold the service key, so everything the server enforces for the
// browser — per-collection rules and their per-identity rate limits — is bypassed
// by definition. Whatever bounds them has to live here.
//
// **Best effort, and worth being precise about why.** These run as serverless
// functions: each instance has its own memory, instances come and go, and a burst
// spread across several of them is counted several times over. So this catches the
// ordinary case — one client hammering a warm instance — and does not pretend to
// be a guarantee. The guarantee is the per-project cap the data plane enforces
// (`max_requests_per_min`), which sees every request whatever served it.
//
// Fixed window rather than a token bucket: a window is one integer per key, and
// the difference only shows up at the boundary, which does not matter for a
// backstop.

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();
/** Sweep at this size, so an idle process does not hold keys forever. */
const MAX_KEYS = 5000;

export type RateVerdict = { ok: true } | { ok: false; retryAfter: number };

/**
 * Count one hit against `key`. Returns the seconds to wait when over.
 *
 * `key` should identify the actor as precisely as the route can: a verified
 * email where the caller is authenticated, the forwarded IP where it is not.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateVerdict {
  const now = Date.now();
  const w = windows.get(key);

  if (!w || now >= w.resetAt) {
    if (windows.size > MAX_KEYS) {
      for (const [k, v] of windows) if (now >= v.resetAt) windows.delete(k);
    }
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  // A refusal does not extend the window — being throttled must not make the
  // wait longer the harder someone tries.
  if (w.count >= limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((w.resetAt - now) / 1000)) };
  }
  w.count += 1;
  return { ok: true };
}

/**
 * Who to count against, when there is no verified identity: the forwarded client
 * IP. Behind Vercel and Cloudflare the socket peer is a proxy, so the header is
 * the only useful answer — and it is spoofable, which is another reason this is a
 * speed bump rather than a wall.
 */
export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const first = fwd.split(",")[0].trim();
  return first || req.headers.get("cf-connecting-ip") || "unknown";
}

/** The 429 these routes should answer with. */
export function tooMany(retryAfter: number): Response {
  return Response.json(
    { error: "slow down" },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
