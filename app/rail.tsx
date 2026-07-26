"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { myNotifications, profileByOwner } from "@/lib/data";
import { oxibase } from "@/lib/oxibase";
import { NOTIFICATIONS_READ } from "@/lib/events";
import { IconBell, IconBookmark, IconHome, IconLogout, IconSearch, IconSettings, IconUser } from "./icons";

const LINKS = [
  ["/", "Home", IconHome],
  ["/search", "Search", IconSearch],
  ["/notifications", "Notifications", IconBell],
  ["/bookmarks", "Bookmarks", IconBookmark],
] as const;

export function Rail() {
  const path = usePathname();
  const { session, signOut, ready } = useSession();
  const [unread, setUnread] = useState(0);
  const [handle, setHandle] = useState<string | null>(null);

  // Unread count, kept live: a notification is a document like any other, so
  // the same subscription mechanism that drives the timeline drives this.
  useEffect(() => {
    if (!ready || !session) {
      setUnread(0);
      return;
    }
    const refresh = () => myNotifications().then((n) => setUnread(n.filter((x) => !x.read).length));
    refresh();
    profileByOwner(session.email).then((p) => setHandle(p?.handle ?? null));
    const sub = oxibase().subscribe("notifications", refresh);
    // Reading them clears the badge immediately; the subscription below then
    // confirms it. Waiting only for the socket left the count up for seconds
    // after the reader was already looking at the list.
    const clear = () => setUnread(0);
    window.addEventListener(NOTIFICATIONS_READ, clear);
    return () => {
      sub.unsubscribe();
      window.removeEventListener(NOTIFICATIONS_READ, clear);
    };
  }, [ready, session]);

  return (
    <nav className="rail">
      <div className="brand">Chirp</div>
      <div className="brand-sub">OxiBase test microblog</div>
      {LINKS.map(([href, label, Icon]) => (
        <Link key={href} href={href} className={path === href ? "active" : undefined}>
          <Icon />
          <span className="label">{label}</span>
          {href === "/notifications" && unread > 0 && <span className="badge">{unread}</span>}
        </Link>
      ))}
      {ready && session && (
        <>
          <Link href={handle ? `/u/${handle}` : "/settings"} className={path.startsWith("/u/") ? "active" : undefined}>
            <IconUser />
            <span className="label">Profile</span>
          </Link>
          <Link href="/settings" className={path === "/settings" ? "active" : undefined}>
            <IconSettings />
            <span className="label">Settings</span>
          </Link>
          <button className="navitem" onClick={signOut}>
            <IconLogout />
            <span className="label">Sign out</span>
          </button>
        </>
      )}
      {ready && !session && (
        <Link href="/login">
          <IconLogout />
          <span className="label">Sign in</span>
        </Link>
      )}
    </nav>
  );
}
