// Demo accounts, posts, follows and reactions, so a visitor sees a living
// timeline rather than an empty page.
//
//   OXIBASE_SERVICE_KEY=<service_role key> npm run seed
//
// Idempotent: it clears the rows it owns (@demo.chirp) and rewrites them.

const URL_ = process.env.NEXT_PUBLIC_OXIBASE_URL || "https://oxibase.baltavista.com";
const REF = process.env.NEXT_PUBLIC_OXIBASE_REF || "chirp";
const KEY = process.env.OXIBASE_SERVICE_KEY;

if (!KEY) {
  console.error("set OXIBASE_SERVICE_KEY (the project's service_role key, from the dashboard)");
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
const sql = (text, params) => api("POST", "/api/sql", { sql: text, params });

const PEOPLE = [
  { handle: "ada", name: "Ada Lovelace", bio: "First programmer. Currently debugging the loom." },
  { handle: "grace", name: "Grace Hopper", bio: "Found the bug. Kept the moth." },
  { handle: "alan", name: "Alan Turing", bio: "Thinking about whether machines can." },
  { handle: "katherine", name: "Katherine Johnson", bio: "The numbers get you home." },
];
const email = (h) => `${h}@demo.chirp`;

const POSTS = [
  ["ada", "Spent the evening writing notes on the Analytical Engine. Note G is the good one. #computing"],
  ["grace", "A ship in port is safe, but that is not what ships are built for. #advice"],
  ["alan", "We can only see a short distance ahead, but we can see plenty there that needs to be done."],
  ["katherine", "Checked the trajectory by hand. Twice. #math"],
  ["ada", "The engine can do whatever we know how to order it to perform. Nothing more, nothing less."],
  ["grace", "It is easier to ask forgiveness than permission. Still true. #advice"],
  ["alan", "Machines take me by surprise with great frequency. #computing"],
  ["katherine", "Someone asked if I trusted the computer. I said I trusted my arithmetic. #math"],
  ["ada", "Imagination is the discovering faculty. It penetrates the unseen worlds around us."],
  ["grace", "The most damaging phrase in the language is 'we've always done it this way'."],
];

console.log(`# Seeding ${REF}`);

// ── Wipe previous demo rows ────────────────────────────────────────────────
for (const col of ["posts", "likes", "reposts", "profiles"]) {
  for (const p of PEOPLE) {
    await api("DELETE", `/rest/v1/${col}?owner=eq.${encodeURIComponent(email(p.handle))}`);
  }
}
await sql("DELETE FROM follows WHERE follower LIKE ?", ["%@demo.chirp"]);

// ── Profiles ───────────────────────────────────────────────────────────────
for (const p of PEOPLE) {
  await api("POST", "/rest/v1/profiles", {
    owner: email(p.handle),
    handle: p.handle,
    name: p.name,
    bio: p.bio,
    avatar_key: null,
    created_at: Date.now(),
  });
}
console.log(`  ✓ profiles: ${PEOPLE.length}`);

// ── Posts, spread over the last few hours ──────────────────────────────────
const tsOf = (i) => Date.now() - (POSTS.length - i) * 17 * MIN;
const created = [];
for (let i = 0; i < POSTS.length; i++) {
  const [handle, body] = POSTS[i];
  const ts = tsOf(i);
  const tags = [...new Set((body.match(/#[\p{L}\p{N}_]{1,40}/gu) ?? []).map((t) => t.slice(1).toLowerCase()))];
  await api("POST", "/rest/v1/posts", {
    owner: email(handle),
    handle,
    body,
    image_key: null,
    reply_to: null,
    repost_of: null,
    tags,
    ts,
  });
  created.push({ handle, ts });
}
console.log(`  ✓ posts: ${created.length}`);

// A couple of replies, so threads are not empty.
const parent = created[0];
for (const [handle, body] of [
  ["grace", "Note G is where it clicks for me too."],
  ["alan", "Reading it again this week."],
]) {
  await api("POST", "/rest/v1/posts", {
    owner: email(handle), handle, body, image_key: null,
    reply_to: parent.ts, repost_of: null, tags: [], ts: Date.now() - 5 * MIN,
  });
}
console.log("  ✓ replies: 2");

// ── Reactions ──────────────────────────────────────────────────────────────
let likes = 0;
for (const post of created) {
  for (const p of PEOPLE) {
    if (p.handle === post.handle) continue;
    if ((post.ts + p.handle.length) % 3 === 0) {
      await api("POST", "/rest/v1/likes", { owner: email(p.handle), post_ts: post.ts });
      likes++;
    }
  }
}
console.log(`  ✓ likes: ${likes}`);

// ── The follow graph (SQL) ─────────────────────────────────────────────────
const EDGES = [
  ["ada", "grace"], ["ada", "alan"],
  ["grace", "ada"], ["grace", "katherine"],
  ["alan", "ada"], ["alan", "katherine"],
  ["katherine", "grace"],
];
for (const [a, b] of EDGES) {
  await sql("INSERT INTO follows (follower, followee, created_at) VALUES (?, ?, ?)", [
    email(a), email(b), Date.now(),
  ]);
}
console.log(`  ✓ follows: ${EDGES.length} edges`);

console.log("\nDone — open the app.");
