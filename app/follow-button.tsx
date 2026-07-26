"use client";

// Following is a write to a SQL table, and a browser key may not write SQL —
// so it goes through this app's route, which pins the follower to the caller's
// verified identity rather than trusting the request.

import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { fetchAuthed } from "@/lib/oxibase";
import { notify } from "@/lib/data";

export function FollowButton({ target, onChanged }: { target: string; onChanged?: () => void }) {
  const { session } = useSession();
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session) return setFollowing(null);
    fetch(`/api/follow?who=${encodeURIComponent(session.email)}`)
      .then((r) => (r.ok ? r.json() : { following: [] }))
      .then((d) => setFollowing((d.following ?? []).includes(target)));
  }, [session, target]);

  if (!session || session.email === target || following === null) return null;

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
