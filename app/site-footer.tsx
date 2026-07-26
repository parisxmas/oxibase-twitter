// What this app is, said plainly.
//
// Rendered twice, and CSS decides which one you see: in the aside on wide
// screens, where it sits under the panels and needs no scrolling, and at the end
// of the feed below 1000px, where the aside is hidden entirely. One component,
// so the two can never drift apart.

export function SiteFooter({ placement }: { placement: "aside" | "inline" }) {
  return (
    <footer className={`site-footer ${placement === "inline" ? "footer-inline" : "footer-aside"}`}>
      <p className="footer-lead">
        <strong>Chirp is a test app for OxiBase</strong> — a demonstration that one
        backend can carry a whole product, not a service of its own.
      </p>
      <p>
        Every feature here is a different part of OxiBase doing real work, rather
        than a mock:
      </p>
      <ul>
        <li>
          <strong>Posts, replies, likes, reposts, bookmarks</strong> are documents,
          and who may write them is decided by per-collection security rules — the
          browser asks, the server adjudicates.
        </li>
        <li>
          <strong>Your bookmarks and notifications</strong> use row-level rules: the
          query asks for everything and the server returns only yours.
        </li>
        <li>
          <strong>The follow graph</strong> is a SQL table, read with aggregates and
          a self-join — which is what &ldquo;who to follow&rdquo; actually is.
        </li>
        <li>
          <strong>Impressions</strong> are time-series points, bucketed by the engine
          rather than counted in the app.
        </li>
        <li>
          <strong>Avatars and post images</strong> are objects in storage, resized in
          your browser before upload.
        </li>
        <li>
          <strong>New posts and notifications</strong> arrive over a WebSocket, with
          the same rules applied to the stream.
        </li>
        <li>
          <strong>Sign-in</strong> is OxiBase auth — password, magic link, Google or
          GitHub — with short-lived access tokens that rotate.
        </li>
      </ul>
      <p>
        The page holds only the project&rsquo;s public key. It cannot write files,
        time-series or SQL tables at all; those go through this app&rsquo;s own
        server routes, which check who you are first.
      </p>
      <p className="footer-warn">
        <strong>For testing only.</strong> Accounts, posts and uploads here are
        disposable and may be deleted at any time, without notice or backup. Please
        do not post anything private, and do not reuse a password you use elsewhere.
      </p>
      <p className="muted small">
        Built on <a href="https://oxibase.baltavista.com">OxiBase</a> · no other
        backend, no ORM, no database of its own.
      </p>
    </footer>
  );
}
