"use client";

// The right-hand column: trends and who to follow.
//
// Trends are an aggregation over the posts collection; suggestions are a
// self-join over the follow graph in SQL — "people followed by people you
// follow", which is exactly the query a relational engine is for.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/session";
import { followGraph } from "@/lib/follow-graph";
import { profiles, timeline } from "@/lib/data";
import { mediaUrl } from "@/lib/oxibase";
import type { Profile } from "@/lib/types";
import { FollowButton } from "./follow-button";
import { SiteFooter } from "./site-footer";

// Placeholders that reuse the *same* elements and classes as the real rows, with
// the text replaced by a non-breaking space and painted over as a bar. Guessing
// at pixel heights does not work — the first attempt was 45px a row against the
// real 57px, so the panel still jumped 369px -> 507px when the data landed. Let
// the same CSS compute the same line boxes and the height is right by
// construction.
function TrendsPlaceholder() {
  return (
    <div aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} style={{ display: "block", padding: "6px 0" }}>
          <div className="tag ph-text" style={{ maxWidth: "62%" }}>
            &nbsp;
          </div>
          <div className="muted small ph-text" style={{ maxWidth: "38%" }}>
            &nbsp;
          </div>
        </div>
      ))}
    </div>
  );
}

function SuggestionsPlaceholder() {
  return (
    <div aria-hidden>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
          <div className="avatar sm ph-text" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ph-text" style={{ fontWeight: 700, maxWidth: "58%" }}>
              &nbsp;
            </div>
            <div className="muted small ph-text" style={{ maxWidth: "72%" }}>
              &nbsp;
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** How long the hashtag counts are allowed to be stale. */
const TRENDS_TTL_MS = 2 * 60 * 1000;

export function Aside() {
  const { session } = useSession();
  const email = session?.email;
  const path = usePathname();
  const [trends, setTrends] = useState<[string, number][]>([]);
  const [suggested, setSuggested] = useState<{ owner: string; shared: number }[]>([]);
  const [byOwner, setByOwner] = useState<Map<string, Profile>>(new Map());
  const [nonce, setNonce] = useState(0);
  // "Not known yet" is not the same as "nothing to show". Without the
  // distinction the box rendered its empty state on first paint and swapped to
  // six rows a moment later — a flash of the wrong answer, and the panels below
  // it jumped down as it grew.
  const [trendsKnown, setTrendsKnown] = useState(false);
  const [suggestedKnown, setSuggestedKnown] = useState(false);

  const lastLoad = useRef(0);
  const lastNonce = useRef(nonce);

  // Trends are an aggregate over the last 200 posts, and this component lives in
  // the layout — it survives navigation rather than remounting. Keyed on the path
  // alone it re-downloaded those 200 posts, and every profile, on *every* click:
  // four navigations cost five trend fetches. Hashtag counts do not move that
  // fast, so a route change refreshes them only if they have gone stale, while
  // an explicit `nonce` bump (following someone) still refreshes immediately.
  useEffect(() => {
    const forced = nonce !== lastNonce.current;
    lastNonce.current = nonce;
    if (!forced && Date.now() - lastLoad.current < TRENDS_TTL_MS) return;
    lastLoad.current = Date.now();

    timeline(200)
      .then((posts) => {
        const counts = new Map<string, number>();
        for (const p of posts) for (const t of p.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
        setTrends([...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6));
      })
      .finally(() => setTrendsKnown(true));
    profiles().then((ps) => setByOwner(new Map(ps.map((p) => [p.owner, p]))));
  }, [path, nonce]);

  useEffect(() => {
    if (!email) {
      setSuggestedKnown(true);
      return setSuggested([]);
    }
    followGraph(email)
      .then((g) => setSuggested(g.suggestions))
      .finally(() => setSuggestedKnown(true));
  }, [email, nonce]);

  return (
    <>
      <div className="box">
        <h3>Trends</h3>
        {!trendsKnown && <TrendsPlaceholder />}
        {trendsKnown && trends.length === 0 && (
          <p className="muted small">Nothing trending yet.</p>
        )}
        {trends.map(([tag, n]) => (
          <Link key={tag} href={`/search?q=%23${tag}`} prefetch={false} style={{ display: "block", padding: "6px 0" }}>
            <div className="tag">#{tag}</div>
            <div className="muted small">{n} post{n > 1 ? "s" : ""}</div>
          </Link>
        ))}
        <span className="engine">documents · aggregate</span>
      </div>

      {session && (
        <div className="box">
          <h3>Who to follow</h3>
          {!suggestedKnown && <SuggestionsPlaceholder />}
          {suggestedKnown && suggested.length === 0 && (
            <p className="muted small">
              Follow a few people and suggestions appear here — they come from a self-join over the
              follow graph.
            </p>
          )}
          {suggested.map((s) => {
            const p = byOwner.get(s.owner);
            return (
              <div key={s.owner} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
                <div className="avatar sm">
                  {p?.avatar_key ? (
                    <img src={mediaUrl(p.avatar_key)} alt="" />
                  ) : (
                    (p?.name ?? s.owner).slice(0, 1).toUpperCase()
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link href={`/u/${p?.handle ?? ""}`} prefetch={false} style={{ fontWeight: 700 }}>
                    {p?.name ?? s.owner.split("@")[0]}
                  </Link>
                  <div className="muted small">followed by {s.shared} you follow</div>
                </div>
                <FollowButton target={s.owner} onChanged={() => setNonce((n) => n + 1)} />
              </div>
            );
          })}
          <span className="engine">sql · self-join</span>
        </div>
      )}

      <SiteFooter placement="aside" />
    </>
  );
}
