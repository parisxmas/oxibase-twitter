// One-time project setup: security rules, document indexes, the full-text index,
// the SQL schema, and the private series. Idempotent — re-running is safe.
//
//   OXIBASE_SERVICE_KEY=<service_role key> npm run setup

const URL_ = process.env.NEXT_PUBLIC_OXIBASE_URL || "https://oxibase.baltavista.com";
const REF = process.env.NEXT_PUBLIC_OXIBASE_REF || "chirp";
const KEY = process.env.OXIBASE_SERVICE_KEY;

if (!KEY) {
  console.error("set OXIBASE_SERVICE_KEY (the project's service_role key, from the dashboard)");
  process.exit(2);
}

const base = `${URL_}/${REF}`;
const H = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function api(method, path, body) {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: H,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

const sql = (text, params) => api("POST", "/api/sql", { sql: text, params });

// ── Document rules ──────────────────────────────────────────────────────────
// The browser holds only the anon key, so these are the authorization model.
// `create: auth.username == doc.owner` is the important one: you may only
// create rows that are yours, so a forged author is refused by the server
// rather than trusted from the client.
const RULES = {
  // Everything public on a microblog: readable by anyone, written by its author.
  posts: {
    read: "true",
    create: "auth.username == doc.owner",
    update: "auth.username == doc.owner",
    delete: "auth.username == doc.owner",
    // Per identity, per operation, checked *after* the expression — so a write the
    // rule refuses never costs anyone budget, and a throttled one answers 429 with
    // Retry-After rather than 403, because "not yet" is not "no". Ten posts a
    // minute is far more than a person writes and far less than a script wants.
    rate: { create: "10/min", update: "30/min", delete: "30/min" },
  },
  likes: {
    read: "true",
    create: "auth.username == doc.owner",
    update: "false",
    delete: "auth.username == doc.owner",
    // Liking is one tap, so the ceiling is high — it exists to stop a loop, not
    // an enthusiastic reader.
    rate: { create: "60/min", delete: "60/min" },
  },
  reposts: {
    read: "true",
    create: "auth.username == doc.owner",
    update: "false",
    delete: "auth.username == doc.owner",
    rate: { create: "30/min", delete: "30/min" },
  },
  profiles: {
    read: "true",
    create: "auth.username == doc.owner",
    update: "auth.username == doc.owner",
    delete: "false",
    // An avatar upload writes the row too, so this is not as rare as it sounds.
    rate: { create: "5/min", update: "20/min" },
  },
  // Yours alone. The read rule references `doc.owner`, which makes it a
  // row-level filter: asking for every bookmark returns only your own.
  bookmarks: {
    read: "auth.username == doc.owner",
    create: "auth.username == doc.owner",
    update: "false",
    delete: "auth.username == doc.owner",
    rate: { create: "60/min", delete: "60/min" },
  },
  // Notifications are addressed to you. Anyone may *create* one (liking a post
  // notifies its author), but only the recipient can read them — again per row.
  notifications: {
    read: "auth.username == doc.owner",
    create: "auth != null",
    update: "auth.username == doc.owner",
    delete: "auth.username == doc.owner",
    // The one collection anyone may write *to someone else*, so it is the one
    // worth bounding tightest: this is the notification-spam path.
    rate: { create: "30/min", update: "60/min", delete: "60/min" },
  },
};

// Rules for the other engines are keyed by name too, but those engines have no
// row-level policy — so the only useful answers are "everyone" or "nobody but
// the server", and anything per-user is read through a route handler.
const OTHER = {
  // Per-post impressions. Readable at all would mean readable by everyone, and
  // a post's reach is its author's business: /api/analytics serves it.
  impressions: { read: "false", create: "false", update: "false", delete: "false" },
};

console.log(`# Setting up ${REF} on ${URL_}`);
for (const [name, rules] of Object.entries({ ...RULES, ...OTHER })) {
  await api("POST", `/api/rules/${name}`, rules);
  const rate = rules.rate ? ` rate=${Object.entries(rules.rate).map(([k, v]) => `${k}:${v}`).join(" ")}` : "";
  console.log(`  ✓ rules: ${name.padEnd(14)} read=${String(rules.read).padEnd(26)}${rate}`);
}

// ── Duplicate-post guard ────────────────────────────────────────────────────
// The one spam signal available without reading content: the same author saying
// the identical thing twice within minutes. A *unique* index makes the engine
// refuse the second claim (409), and a *TTL* index expires the claim, so the
// window is the TTL rather than something the app has to sweep.
//
// Rules: writable by its owner, readable by nobody — the keys are hashes, but a
// list of them still tells you who posted when, and nothing needs to read it.
await api("POST", "/api/rules/post_guards", {
  read: "false",
  create: "auth.username == doc.owner",
  update: "false",
  delete: "false",
  rate: { create: "10/min" },
});
await api("POST", "/api/post_guards/indexes", { type: "unique", field: "key" });
await api("POST", "/api/post_guards/indexes", {
  type: "ttl",
  field: "ts",
  expireAfterSeconds: 10 * 60,
});
console.log("  ✓ guard: post_guards   unique(key) + ttl(ts, 10m) — no repeat posts");

// ── Document indexes ────────────────────────────────────────────────────────
// Collections are created implicitly by the first insert, and an implicit
// collection has no indexes — so without this a fresh deployment scans for every
// read. It is invisible at demo size and linear afterwards: at ~1k posts the
// timeline query measured 5.35ms unindexed and 1.12ms indexed (4.8x), because an
// index turns `order by ts desc limit 20` into a walk of twenty rather than a
// sort of everything. The flat lookups gain less now and much more later.
//
// Each entry is a field the app actually filters or sorts on. Adding one it does
// not use costs write throughput for nothing, so this list is deliberately not
// "every field".
const DOC_INDEXES = {
  // ts: cursor pagination and every `order=ts.desc`. reply_to: the timeline asks
  // for top-level posts (`is.null`) and a thread asks for one parent's replies.
  posts: ["ts", "handle", "reply_to", "owner"],
  likes: ["owner", "post_ts"],
  reposts: ["owner", "post_ts"],
  bookmarks: ["owner"],
  notifications: ["owner", "ts"],
  profiles: ["owner", "handle"],
};

for (const [col, fields] of Object.entries(DOC_INDEXES)) {
  for (const field of fields) {
    await api("POST", `/api/${col}/indexes`, { field });
  }
  console.log(`  ✓ index: ${col.padEnd(14)} ${fields.join(", ")}`);
}

// ── Full-text index ─────────────────────────────────────────────────────────
// Ranked search (BM25) over post bodies. Without it `searchPosts` falls back to
// a substring match ordered by recency — the server says so explicitly with a
// 400, which is what the fallback keys off.
await api("POST", "/api/posts/text_index", { fields: ["body"] });
console.log("  ✓ text index: posts (body) — search is ranked, not substring");

// ── SQL schema ──────────────────────────────────────────────────────────────
// The follow graph is the relational part of a microblog: "who to follow" is a
// self-join over it, and follower counts are an aggregate. Writes go through
// /api/follow, because a browser key may not write SQL.
const DDL = [
  `CREATE TABLE IF NOT EXISTS follows (
     id INTEGER PRIMARY KEY AUTO_INCREMENT,
     follower VARCHAR(160) NOT NULL,
     followee VARCHAR(160) NOT NULL,
     created_at TIMESTAMP NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows (follower)`,
  `CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows (followee)`,
];
for (const stmt of DDL) {
  await sql(stmt);
  console.log(`  ✓ sql: ${stmt.split("\n")[0].trim().slice(0, 58)}…`);
}

console.log("\nDone. Next: `npm run seed` for demo accounts and posts.");
