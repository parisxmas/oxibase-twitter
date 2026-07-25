"use client";

import { useEffect, useRef, useState } from "react";
import { mediaUrl } from "@/lib/oxibase";
import { useSession, authHeader } from "@/lib/session";
import { prepareImage, formatBytes } from "@/lib/image";
import { createPost, notify, profileByOwner } from "@/lib/data";
import { MAX_POST_LENGTH, defaultHandle } from "@/lib/types";
import { IconClose, IconImage } from "./icons";

export function Composer({
  replyTo,
  placeholder = "What's happening?",
  onPosted,
}: {
  replyTo?: { ts: number; owner: string; handle?: string } | null;
  placeholder?: string;
  onPosted: () => void;
}) {
  const { session } = useSession();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; note: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const blobRef = useRef<Blob | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Grow to fit what has been typed: reset to auto first so the box can also
  // shrink again when text is deleted.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [body]);

  if (!session) return null;

  const left = MAX_POST_LENGTH - body.length;
  const over = left < 0;

  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      // Shrunk here, not on the server: a phone photo is larger than a
      // serverless function will accept, and far larger than a post needs.
      const { blob, originalBytes } = await prepareImage(file);
      blobRef.current = blob;
      setPreview({
        url: URL.createObjectURL(blob),
        note:
          blob.size < originalBytes
            ? `resized in your browser: ${formatBytes(originalBytes)} → ${formatBytes(blob.size)}`
            : `${formatBytes(blob.size)} — already small enough to send as it is`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function clearImage() {
    blobRef.current = null;
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit() {
    if (!session || (!body.trim() && !blobRef.current) || over) return;
    setBusy(true);
    setError(null);
    try {
      let image_key: string | null = null;
      if (blobRef.current) {
        // Storage writes need the service key, which never reaches a browser,
        // so the upload goes through this app's route.
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": blobRef.current.type, ...authHeader(session) },
          body: blobRef.current,
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "upload failed");
        image_key = (await res.json()).key as string;
      }

      const profile = await profileByOwner(session.email);
      const { error: err } = await createPost({
        owner: session.email,
        handle: profile?.handle ?? defaultHandle(session.email),
        body: body.trim(),
        image_key,
        reply_to: replyTo?.ts ?? null,
        reply_to_handle: replyTo?.handle ?? null,
      });
      if (err) throw new Error(err);

      if (replyTo) await notify(replyTo.owner, session.email, "reply", replyTo.ts);

      setBody("");
      clearImage();
      onPosted();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="composer">
      <div className="avatar">{session.email.slice(0, 1).toUpperCase()}</div>
      <div>
        <textarea
          ref={textRef}
          rows={1}
          value={body}
          placeholder={placeholder}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
          }}
        />
        {preview && (
          <div style={{ position: "relative" }}>
            <img className="media" src={preview.url} alt="" />
            <button
              className="ghost"
              style={{ position: "absolute", top: 8, right: 8, padding: "2px 10px" }}
              onClick={clearImage}
            >
              <IconClose size={18} />
            </button>
            <div className="muted small">{preview.note}</div>
          </div>
        )}
        {error && <div className="error" style={{ margin: "8px 0" }}>{error}</div>}
        <div className="row">
          <button className="ghost icon" onClick={() => fileRef.current?.click()} title="Add an image">
            <IconImage size={21} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickImage} />
          <span className={`counter ${over ? "over" : ""}`}>{left}</span>
          <button className="primary" disabled={busy || over || (!body.trim() && !preview)} onClick={submit}>
            {busy ? "Posting…" : replyTo ? "Reply" : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}

export { mediaUrl };
