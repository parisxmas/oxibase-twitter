"use client";

// Following is a write to a SQL table, and a browser key may not write SQL —
// so it goes through this app's route, which pins the follower to the caller's
// verified identity rather than trusting the request.
//
// The *state* of the button comes from the session's following set, fetched
// once when the session settles. It used to be a fetch per button, which is why
// the control appeared a second after the page did.

import { useState } from "react";
import { useSession } from "@/lib/session";
import { fetchAuthed } from "@/lib/oxibase";
import { notify } from "@/lib/data";
import { useFollowing } from "@/lib/following";

export function FollowButton({ target, onChanged }: { target: string; onChanged?: () => void }) {
  const { session } = useSession();
  const { isFollowing, apply } = useFollowing();
  const [busy, setBusy] = useState(false);

  const following = isFollowing(target);

  if (!session || session.email === target) return null;
  // Not known yet — hold the space rather than popping a control into the
  // layout once the answer arrives.
  if (following === null) {
    return (
      <button className="ghost" disabled aria-hidden style={{ visibility: "hidden" }}>
        Following
      </button>
    );
  }

  async function toggle() {
    const next = !following;
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
      if (next) await notify(target, session!.email, "follow");
      apply(target, next);
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
