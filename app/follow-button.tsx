"use client";

// Following is a write to a SQL table, and a browser key may not write SQL —
// so it goes through this app's route, which pins the follower to the caller's
// verified identity rather than trusting the request.

import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { fetchAuthed } from "@/lib/oxibase";
import { notify } from "@/lib/data";
import { cachedFollowGraph, followGraph, invalidateFollowGraph } from "@/lib/follow-graph";

export function FollowButton({ target, onChanged }: { target: string; onChanged?: () => void }) {
  const { session } = useSession();
  // Seeded from the cache when the graph is already known — navigating to a
  // second profile then needs no request at all, and the button is right on the
  // first frame instead of appearing a moment later.
  const [following, setFollowing] = useState<boolean | null>(() => {
    const graph = session ? cachedFollowGraph(session.email) : null;
    return graph ? graph.following.includes(target) : null;
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session) return setFollowing(null);
    let live = true;
    followGraph(session.email).then((g) => {
      if (live) setFollowing(g.following.includes(target));
    });
    return () => {
      live = false;
    };
  }, [session, target]);

  if (!session || session.email === target) return null;
  // Not known yet: hold the space rather than popping a control into the layout
  // once the answer arrives.
  if (following === null) {
    return (
      <button className="ghost" disabled aria-hidden style={{ visibility: "hidden" }}>
        Following
      </button>
    );
  }

  async function toggle() {
    setBusy(true);
    const res = await fetchAuthed(
      following ? `/api/follow?followee=${encodeURIComponent(target)}` : "/api/follow",
      {
        method: following ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: following ? undefined : JSON.stringify({ followee: target }),
      },
    );
    if (res.ok) {
      if (!following) await notify(target, session!.email, "follow");
      // Both sides of the edge changed: the viewer's following list and the
      // target's followers.
      invalidateFollowGraph(session!.email);
      invalidateFollowGraph(target);
      setFollowing(!following);
      onChanged?.();
    }
    setBusy(false);
  }

  return (
    <button className={`ghost ${following ? "on" : ""}`} disabled={busy} onClick={toggle}>
      {following ? "Following" : "Follow"}
    </button>
  );
}
