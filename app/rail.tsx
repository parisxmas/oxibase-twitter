"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { myNotifications, profileByOwner } from "@/lib/data";
import { oxibase } from "@/lib/oxibase";

const LINKS = [
  ["/", "Home", "◎"],
  ["/search", "Search", "⌕"],
  ["/notifications", "Notifications", "◔"],
  ["/bookmarks", "Bookmarks", "❏"],
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
    return () => sub.unsubscribe();
  }, [ready, session]);

  return (
    <nav className="rail">
      <div className="brand">Chirp</div>
      {LINKS.map(([href, label, icon]) => (
        <Link key={href} href={href} className={path === href ? "active" : undefined}>
          <span aria-hidden>{icon}</span>
          <span className="label">{label}</span>
          {href === "/notifications" && unread > 0 && <span className="badge">{unread}</span>}
        </Link>
      ))}
      {ready && session && (
        <>
          <Link href={handle ? `/u/${handle}` : "/settings"} className={path.startsWith("/u/") ? "active" : undefined}>
            <span aria-hidden>☺</span>
            <span className="label">Profile</span>
          </Link>
          <Link href="/settings" className={path === "/settings" ? "active" : undefined}>
            <span aria-hidden>⚙</span>
            <span className="label">Settings</span>
          </Link>
          <button className="navitem" onClick={signOut}>
            <span aria-hidden>⏻</span>
            <span className="label">Sign out</span>
          </button>
        </>
      )}
      {ready && !session && (
        <Link href="/login">
          <span aria-hidden>→</span>
          <span className="label">Sign in</span>
        </Link>
      )}
    </nav>
  );
}
