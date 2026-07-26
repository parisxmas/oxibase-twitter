// POST /api/upload — body: the image bytes
//
// Storage writes need a service_role key, which must never reach a browser, so
// the upload is proxied here. The caller still has to prove who they are: the
// stored key is derived from their verified email, so nobody can overwrite
// someone else's photo by choosing a clever filename.

import { verifyCaller, service } from "@/lib/server";
import { rateLimit, tooMany } from "@/lib/rate-limit";

// Vercel caps a function request body at 4.5 MB; the client downscales before
// sending, and we refuse anything larger rather than failing opaquely.
const MAX_BYTES = 4_000_000;

export async function POST(req: Request) {
  const caller = await verifyCaller(req);
  if (!caller) {
    return Response.json({ error: "sign in to upload an image" }, { status: 401 });
  }

  // The most expensive thing a signed-in user can ask for: each call spends up to
  // 4MB of the project's 500MB storage quota, with the service key, so no rule
  // limits it. Counted per verified caller rather than per IP — the identity is
  // what the quota belongs to.
  const limited = rateLimit(`upload:${caller.email}`, 20, 5 * 60_000);
  if (!limited.ok) return tooMany(limited.retryAfter);

  const type = req.headers.get("content-type") ?? "application/octet-stream";
  if (!type.startsWith("image/")) {
    return Response.json({ error: "only images can be uploaded" }, { status: 415 });
  }
  const bytes = await req.arrayBuffer();
  if (bytes.byteLength === 0) {
    return Response.json({ error: "empty upload" }, { status: 400 });
  }
  if (bytes.byteLength > MAX_BYTES) {
    return Response.json(
      { error: "image too large — it should be downscaled to under 4 MB before upload" },
      { status: 413 },
    );
  }

  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  // Namespaced by the *verified* caller, not by anything they sent. The owner
  // segment is reduced to URL-safe characters rather than percent-encoded:
  // storage decodes the path when it stores, so an encoded key would come back
  // different from the one recorded here and never resolve again.
  const owner = caller.email.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  const key = `${owner}/${Date.now()}.${ext}`;

  const res = await service("PUT", `/api/storage/photos/${key}`, {
    body: bytes,
    headers: { "Content-Type": type },
  });
  if (!res.ok) {
    const detail = await res.text();
    return Response.json({ error: `storage refused the upload: ${detail.slice(0, 200)}` }, {
      status: 502,
    });
  }
  return Response.json({ key }, { status: 201 });
}
