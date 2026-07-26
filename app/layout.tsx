import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/lib/session";
import { FollowingProvider } from "@/lib/following";
import { Rail } from "./rail";
import { Aside } from "./aside";
import { SiteFooter } from "./site-footer";

export const metadata: Metadata = {
  title: "Chirp",
  description:
    "A microblog built entirely on OxiBase — posts, a relational follow graph, per-post impressions, live notifications and row-level security.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <FollowingProvider>
          <div className="app">
            <Rail />
            <main>
              {children}
              <SiteFooter placement="inline" />
            </main>
            <div className="aside">
              <Aside />
            </div>
          </div>
          </FollowingProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
