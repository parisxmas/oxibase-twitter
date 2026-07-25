# Chirp

A microblog built entirely on [OxiBase](https://oxibase.baltavista.com) — no other backend, no
ORM, no database of its own. Post, reply, like, repost, bookmark, follow people, search hashtags,
get live notifications, and see how many people actually saw your post.

It exists to answer one question honestly: *what does a real app look like when every part of the
backend is OxiBase?* — and, unlike a tutorial, to be wrong about nothing.

## What each feature actually uses

| Feature | Engine |
|---|---|
| Posts, replies, likes, reposts, profiles | **Documents** — collections over a PostgREST-compatible API |
| Bookmarks and notifications | **Row-level rules** — the query asks for everything and gets only yours |
| Follow graph, follower counts, "who to follow" | **SQL** — a real table, aggregates, and a self-join |
| Impressions per post, hourly | **Time-series** — one point per view, aggregated by the engine |
| Avatars and post images | **Storage** — resized and re-encoded to WebP in the browser first |
| New posts and notifications arriving | **Realtime** — one WebSocket, rules applied to the stream |
| Sign in | **Auth** — password, forgot-password, magic link, Google, GitHub |

Three engines live in one project behind one URL. A collection and a SQL table can never share a
name, so `.from("posts")` and `.from("follows")` reach different engines without the app saying
so; the time-series engine is selected with a schema profile.

## The security model, and why there is a server half

The browser holds the project's **anon key**. It is public by design — it ships in the JavaScript
bundle and is in `.env.example` on purpose. What keeps it safe is that everything it can do is
bounded server-side:

- **`create: auth.username == doc.owner`** — you may only create rows that are yours. Posting as
  someone else is refused by the server, not prevented by the UI.
- **Bookmarks and notifications** have read rules referencing `doc.owner`, so they filter *per
  row*: `/bookmarks` asks for every bookmark in the project and receives only the reader's.
- **Files, time-series and SQL tables cannot be written from a browser at all** — those engines
  have no per-row policy, so writing them requires the `service_role` key.

That last point is the only reason this app has route handlers:

```
browser (anon key, then the user's token)      server routes (service key, never in the bundle)
  ├── posts, likes, bookmarks · rules decide     ├── /api/upload    · images, after JWKS verify
  ├── follow graph reads      · SELECT only      ├── /api/follow    · writes the SQL graph as you
  ├── search, profiles        · public           ├── /api/view      · appends an impression
  └── realtime                · rules filter     └── /api/analytics · your own post's reach
```

Each of those routes verifies the caller's token against the **project's public key** from its
JWKS endpoint, then acts under that verified identity — so you cannot follow on someone else's
behalf, upload over their avatar, or read another author's impressions.

## Running it

```bash
npm install
cp .env.example .env.local     # anon key is already there; add the service key
npm run setup                  # rules, SQL schema, private series
npm run seed                   # demo accounts, posts, follows
npm run dev
```

`OXIBASE_SERVICE_KEY` comes from the OxiBase dashboard → your project → `service_role`. It stays
on the server; only the route handlers read it.

## Deploying to Vercel

Import the repo and set the four variables from `.env.example` (three public, one server-only),
then add your deployment URL to the project's **allowed redirect URLs** in the dashboard — magic
links and social sign-in only return a session to a listed URL.

Fits the free plan: static pages plus five small handlers, and images are resized in the browser
because a Vercel function body is capped at 4.5 MB.

## Seeding a lot of it

```bash
OXIBASE_SERVICE_KEY=… COUNT=1000 node scripts/seed-many.mjs
```

Writes `COUNT` posts across the demo accounts, one in five carrying an image,
spread over the last month. Posts go in batches of 50 and images upload eight at
a time, so a thousand posts is about twenty requests rather than a thousand.

## Notes

- Demo accounts are `*@demo.chirp`; `npm run seed` rewrites only those rows.
- The SDK installs from the deployment (`oxibase-js.tgz`) rather than npm.
- A post's `ts` is its identity — unique per author per millisecond, sorts naturally, and lets a
  reply point at its parent without a round-trip.
