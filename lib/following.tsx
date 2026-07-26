"use client";

// Who the signed-in reader follows, fetched once per session.
//
// Every follow button used to ask this question for itself, so the answer
// arrived a beat after the button could have been drawn and the control
// appeared late. It is one small list that changes only when *this* reader
// follows someone, so it belongs to the session rather than to a component:
// fetched once when the session settles, held here, and updated in place when
// the reader acts.
//
// Null means "not known yet" and is different from an empty set — a button that
// cannot tell those apart renders "Follow" for someone you already follow.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSession } from "./session";
import { followGraph, invalidateFollowGraph } from "./follow-graph";

type Ctx = {
  /** Addresses this reader follows, or null while unknown. */
  following: Set<string> | null;
  /** True / false / null-when-unknown, for one target. */
  isFollowing: (target: string) => boolean | null;
  /** Record a follow or unfollow that has already been accepted by the server. */
  apply: (target: string, next: boolean) => void;
};

const FollowingContext = createContext<Ctx>({
  following: null,
  isFollowing: () => null,
  apply: () => {},
});

export function FollowingProvider({ children }: { children: React.ReactNode }) {
  const { session, ready } = useSession();
  const email = session?.email;
  const [following, setFollowing] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!email) return setFollowing(new Set());
    let live = true;
    followGraph(email).then((g) => {
      if (live) setFollowing(new Set(g.following));
    });
    return () => {
      live = false;
    };
  }, [ready, email]);

  const isFollowing = useCallback(
    (target: string) => (following === null ? null : following.has(target)),
    [following],
  );

  const apply = useCallback(
    (target: string, next: boolean) => {
      setFollowing((prev) => {
        const copy = new Set(prev ?? []);
        if (next) copy.add(target);
        else copy.delete(target);
        return copy;
      });
      // The cached graphs are now stale on both ends of the edge: this reader's
      // following list, and the target's followers.
      if (email) invalidateFollowGraph(email);
      invalidateFollowGraph(target);
    },
    [email],
  );

  const value = useMemo(() => ({ following, isFollowing, apply }), [following, isFollowing, apply]);
  return <FollowingContext.Provider value={value}>{children}</FollowingContext.Provider>;
}

export function useFollowing(): Ctx {
  return useContext(FollowingContext);
}
