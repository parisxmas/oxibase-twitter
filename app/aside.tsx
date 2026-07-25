"use client";

// The right-hand column: trends and who to follow.
//
// Trends are an aggregation over the posts collection; suggestions are a
// self-join over the follow graph in SQL — "people followed by people you
// follow", which is exactly the query a relational engine is for.

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/session";
import { profiles, timeline } from "@/lib/data";
import type { Profile } from "@/lib/types";
import { FollowButton } from "./follow-button";

export function Aside() {
  const { session } = useSession();
  const path = usePathname();
  const [trends, setTrends] = useState<[string, number][]>([]);
  const [suggested, setSuggested] = useState<{ owner: string; shared: number }[]>([]);
  const [byOwner, setByOwner] = useState<Map<string, Profile>>(new Map());
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    timeline(200).then((posts) => {
      const counts = new Map<string, number>();
      for (const p of posts) for (const t of p.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
      setTrends([...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6));
    });
    profiles().then((ps) => setByOwner(new Map(ps.map((p) => [p.owner, p]))));
  }, [path, nonce]);

  useEffect(() => {
    if (!session) return setSuggested([]);
    fetch(`/api/follow?who=${encodeURIComponent(session.email)}`)
      .then((r) => (r.ok ? r.json() : { suggestions: [] }))
      .then((d) => setSuggested(d.suggestions ?? []));
  }, [session, nonce]);

  return (
    <>
      <div className="box">
        <h3>Trends</h3>
        {trends.length === 0 && <p className="muted small">Nothing trending yet.</p>}
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
          {suggested.length === 0 && (
            <p className="muted small">
              Follow a few people and suggestions appear here — they come from a self-join over the
              follow graph.
            </p>
          )}
          {suggested.map((s) => {
            const p = byOwner.get(s.owner);
            return (
              <div key={s.owner} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
                <div className="avatar sm">{(p?.name ?? s.owner).slice(0, 1).toUpperCase()}</div>
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
    </>
  );
}
