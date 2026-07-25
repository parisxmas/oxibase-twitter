"use client";

// Two ways to say "loading", used consistently across the app.
//
// A timeline gets skeleton posts, so the page keeps its shape and does not
// collapse and then jump when the rows arrive. Everything else gets a spinner.

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="spinner" aria-hidden />
      {label && <span className="muted small">{label}</span>}
      <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        Loading
      </span>
    </div>
  );
}

export function SkeletonFeed({ rows = 5, spinner = true }: { rows?: number; spinner?: boolean }) {
  return (
    <div role="status" aria-live="polite" aria-label="Loading posts">
      {spinner && (
        <div className="loading" style={{ padding: "26px 16px 18px" }}>
          <div className="spinner" aria-hidden />
        </div>
      )}
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton" key={i}>
          <div className="circle" />
          <div>
            <div className="bar" style={{ width: "38%" }} />
            <div className="bar" style={{ width: "92%" }} />
            <div className="bar" style={{ width: `${60 + ((i * 13) % 30)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
