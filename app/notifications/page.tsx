"use client";

// Notifications: created by whoever acted, readable only by their recipient.
// `create: auth != null` lets anyone address one to you; `read:
// auth.username == doc.owner` means nobody else can read your inbox.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { oxibase } from "@/lib/oxibase";
import { useSession } from "@/lib/session";
import { markNotificationsRead, myNotifications } from "@/lib/data";
import { NOTIFICATIONS_READ } from "@/lib/events";
import { relativeTime, type Notification } from "@/lib/types";
import { Spinner } from "../loading-ui";
import { IconHeart, IconReply, IconRepost, IconUser } from "../icons";

const VERB: Record<Notification["kind"], string> = {
  like: "liked your post",
  reply: "replied to your post",
  repost: "reposted you",
  follow: "followed you",
};

const ICON: Record<Notification["kind"], React.ComponentType<{ size?: number; filled?: boolean }>> = {
  like: IconHeart,
  reply: IconReply,
  repost: IconRepost,
  follow: IconUser,
};

/** The colour matches the action, as it does on the post itself. */
const TINT: Record<Notification["kind"], string> = {
  like: "var(--like)",
  reply: "var(--accent)",
  repost: "var(--repost)",
  follow: "var(--accent)",
};

export default function Notifications() {
  const { session, ready } = useSession();
  const email = session?.email;
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  // Which ones were new when this page opened. They are marked read straight
  // away, so without remembering them the highlight would vanish under the
  // reader a moment after they arrived — the one thing the page is for.
  const wasNew = useRef<Set<string>>(new Set());
  const captured = useRef(false);

  const key = (n: Notification) => String(n._id ?? `${n.ts}-${n.actor}`);

  const load = useCallback(async () => {
    if (!email) return setLoading(false);
    const list = await myNotifications();
    if (!captured.current) {
      for (const n of list) if (!n.read) wasNew.current.add(key(n));
      captured.current = true;
    }
    setItems(list);
    setLoading(false);
  }, [email]);

  useEffect(() => {
    load();
  }, [load]);

  // Live: the same subscription mechanism as the timeline, and the server
  // applies the read rule to the stream too — you only receive your own.
  useEffect(() => {
    if (!email) return;
    const sub = oxibase().subscribe("notifications", () => load());
    return () => sub.unsubscribe();
  }, [email, load]);

  // Read means seen, and they are seen now — not when the reader happens to
  // navigate away, which is what used to leave the badge sitting there through
  // the whole visit. The rail is told directly rather than waiting for the
  // change to come back over the realtime socket.
  useEffect(() => {
    if (!email || loading) return;
    markNotificationsRead(email)
      .then(() => window.dispatchEvent(new Event(NOTIFICATIONS_READ)))
      .catch(() => {});
  }, [email, loading]);

  if (ready && !session) {
    return (
      <>
        <div className="topbar"><h1>Notifications</h1></div>
        <p className="center muted">Sign in to see your notifications.</p>
      </>
    );
  }

  return (
    <>
      <div className="topbar">
        <h1>Notifications</h1>
        <span className="engine" style={{ marginLeft: "auto" }}>realtime · row-level rule</span>
      </div>
      {loading && <Spinner />}
      {!loading && items.length === 0 && <p className="center muted">Nothing yet.</p>}
      {items.map((n) => {
        const Icon = ICON[n.kind];
        return (
        <div key={n._id ?? `${n.ts}-${n.actor}`} className={`notif ${wasNew.current.has(key(n)) ? "unread" : ""}`}>
          <div className="avatar sm" aria-hidden style={{ color: TINT[n.kind] }}>
            <Icon size={20} filled={n.kind === "like"} />
          </div>
          <div>
            <div>
              <Link href={`/u/${n.actor_handle}`} style={{ fontWeight: 700 }}>
                @{n.actor_handle}
              </Link>{" "}
              {VERB[n.kind]}
            </div>
            <div className="muted small">
              {relativeTime(n.ts)}
              {n.post_ts ? (
                <>
                  {" · "}
                  <Link href={`/post/${n.post_ts}`} className="tag">view</Link>
                </>
              ) : null}
            </div>
          </div>
        </div>
        );
      })}
    </>
  );
}
