// Fill the timeline with a lot of posts, so paging and counting are exercised
// against something realistic rather than a dozen rows.
//
//   OXIBASE_SERVICE_KEY=… COUNT=1000 node scripts/seed-many.mjs
//
// One in five posts carries an image. Everything is written as the demo
// accounts (@demo.chirp), so `npm run seed` can wipe it again.

const URL_ = process.env.NEXT_PUBLIC_OXIBASE_URL || "https://oxibase.baltavista.com";
const REF = process.env.NEXT_PUBLIC_OXIBASE_REF || "chirp";
const KEY = process.env.OXIBASE_SERVICE_KEY;
const COUNT = Number(process.env.COUNT || 1000);
const IMAGE_EVERY = Number(process.env.IMAGE_EVERY || 5);

if (!KEY) {
  console.error("set OXIBASE_SERVICE_KEY (the project's service_role key)");
  process.exit(2);
}

const base = `${URL_}/${REF}`;
const H = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const MIN = 60_000;

async function api(method, path, body, extra = {}) {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: { ...H, ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : null;
}

const PEOPLE = ["ada", "grace", "alan", "katherine", "edsger", "barbara", "linus", "margaret"];
const email = (h) => `${h}@demo.chirp`;

const OPENERS = [
  "Shipped", "Reading about", "Thinking about", "Debugging", "Rewrote", "Benchmarked",
  "Finally understood", "Gave up on", "Went back to", "Profiling", "Sketching out", "Reviewing",
];
const SUBJECTS = [
  "the query planner", "a B-tree", "the WAL", "an index", "the cache layer", "a race condition",
  "the parser", "a memory leak", "the retry logic", "the schema", "a flaky test", "the API surface",
  "a migration", "the build", "a deadlock", "the storage engine",
];
const ENDINGS = [
  "and it is finally fast.", "again.", "— worth it.", "at 2am, as one does.",
  "and learned something.", "for the third time this week.", "and it was the cache all along.",
  "but the fix was one line.", "and the numbers surprised me.", "so the tests can stop shouting.",
];
const TAGS = ["#databases", "#rust", "#perf", "#debugging", "#systems", "#oxibase", "#sql", "#latency"];

const pick = (a, i) => a[i % a.length];
const rnd = (n) => Math.floor(Math.random() * n);

function bodyFor(i) {
  const parts = [pick(OPENERS, rnd(99) + i), pick(SUBJECTS, rnd(99) + i * 3), pick(ENDINGS, rnd(99) + i * 7)];
  let text = `${parts[0]} ${parts[1]} ${parts[2]}`;
  if (i % 3 === 0) text += ` ${pick(TAGS, rnd(99) + i)}`;
  if (i % 11 === 0) text += ` ${pick(TAGS, rnd(50) + i * 2)}`;
  return text;
}

const tags = (body) => [
  ...new Set((body.match(/#[\p{L}\p{N}_]{1,40}/gu) ?? []).map((t) => t.slice(1).toLowerCase())),
];

/** Upload one photo, returning its storage key. */
async function uploadPhoto(handle, ts, seed) {
  const r = await fetch(`https://picsum.photos/seed/${seed}/1000/600`, { redirect: "follow" });
  if (!r.ok) return null;
  const bytes = Buffer.from(await r.arrayBuffer());
  const key = `${email(handle).replace(/[^a-z0-9._-]+/g, "-")}/${ts}.jpg`;
  const up = await fetch(`${base}/api/storage/photos/${key}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "image/jpeg" },
    body: bytes,
  });
  return up.ok ? key : null;
}

/** Run `jobs` with a small pool, so 200 uploads do not open 200 sockets. */
async function pooled(jobs, size = 8) {
  const results = new Array(jobs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, jobs.length) }, async () => {
      while (next < jobs.length) {
        const i = next++;
        results[i] = await jobs[i]();
      }
    }),
  );
  return results;
}

console.log(`# Seeding ${COUNT} posts into ${REF} (image every ${IMAGE_EVERY})`);

// Profiles for anyone missing one.
for (const h of PEOPLE) {
  const existing = await api("GET", `/rest/v1/profiles?handle=eq.${h}&select=handle`);
  if (existing.length === 0) {
    await api("POST", "/rest/v1/profiles", {
      owner: email(h),
      handle: h,
      name: h[0].toUpperCase() + h.slice(1),
      bio: "Demo account",
      avatar_key: null,
      created_at: Date.now(),
    });
  }
}
console.log(`  ✓ profiles ready (${PEOPLE.length})`);

// Spread the posts over the last 30 days, newest last so `ts` is unique.
const now = Date.now();
const posts = [];
for (let i = 0; i < COUNT; i++) {
  const handle = pick(PEOPLE, i * 3 + rnd(3));
  const ts = now - (COUNT - i) * 40 * MIN - rnd(30 * MIN);
  const body = bodyFor(i);
  posts.push({ owner: email(handle), handle, body, image_key: null, reply_to: null, repost_of: null, tags: tags(body), ts });
}

// Images for one in five, fetched and uploaded concurrently.
const withImages = posts.filter((_, i) => i % IMAGE_EVERY === 0);
console.log(`  … uploading ${withImages.length} images`);
const keys = await pooled(
  withImages.map((p, i) => () => uploadPhoto(p.handle, p.ts, `${p.ts}-${i}`).catch(() => null)),
  8,
);
withImages.forEach((p, i) => (p.image_key = keys[i]));
console.log(`  ✓ images: ${keys.filter(Boolean).length}/${withImages.length}`);

// Insert in batches — the surface accepts an array, so 1000 posts is 20
// requests rather than 1000.
const BATCH = 50;
for (let i = 0; i < posts.length; i += BATCH) {
  await api("POST", "/rest/v1/posts", posts.slice(i, i + BATCH));
  process.stdout.write(`\r  … posts ${Math.min(i + BATCH, posts.length)}/${posts.length}`);
}
console.log(`\n  ✓ posts: ${posts.length}`);

// A scattering of likes, in batches too.
const likes = [];
for (const p of posts) {
  for (const h of PEOPLE) {
    if (h !== p.handle && rnd(9) === 0) likes.push({ owner: email(h), post_ts: p.ts });
  }
}
for (let i = 0; i < likes.length; i += 200) {
  await api("POST", "/rest/v1/likes", likes.slice(i, i + 200));
}
console.log(`  ✓ likes: ${likes.length}`);

console.log("\nDone.");
