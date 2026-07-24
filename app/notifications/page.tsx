"use client";

// Notifications: created by whoever acted, readable only by their recipient.
// `create: auth != null` lets anyone address one to you; `read:
// auth.username == doc.owner` means nobody else can read your inbox.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { oxibase } from "@/lib/oxibase";
import { useSession } from "@/lib/session";
import { markNotificationsRead, myNotifications } from "@/lib/data";
import { relativeTime, type Notification } from "@/lib/types";
import { Spinner } from "../loading-ui";

const VERB: Record<Notification["kind"], string> = {
  like: "liked your post",
  reply: "replied to your post",
  repost: "reposted you",
  follow: "followed you",
};

const ICON: Record<Notification["kind"], string> = { like: "♥", reply: "↩", repost: "⇄", follow: "☺" };

export default function Notifications() {
  const { session, ready } = useSession();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) return setLoading(false);
    setItems(await myNotifications());
    setLoading(false);
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  // Live: the same subscription mechanism as the timeline, and the server
  // applies the read rule to the stream too — you only receive your own.
  useEffect(() => {
    if (!session) return;
    const sub = oxibase().subscribe("notifications", () => load());
    return () => sub.unsubscribe();
  }, [session, load]);

  // Mark read on leaving the page, so the badge clears once they are seen.
  useEffect(() => {
    return () => {
      if (session) markNotificationsRead(session.email).catch(() => {});
    };
  }, [session]);

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
      {items.map((n) => (
        <div key={n._id ?? `${n.ts}-${n.actor}`} className={`notif ${n.read ? "" : "unread"}`}>
          <div className="avatar sm" aria-hidden>{ICON[n.kind]}</div>
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
      ))}
    </>
  );
}
