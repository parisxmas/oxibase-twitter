"use client";

// Your profile: handle, name, bio, avatar. The profile row is a document you
// own, so the browser writes it directly and the rule enforces ownership; the
// avatar is a file, so it goes through the upload route.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { mediaUrl, fetchAuthed } from "@/lib/oxibase";
import { useSession } from "@/lib/session";
import { prepareImage, formatBytes } from "@/lib/image";
import { profileByHandle, profileByOwner, saveProfile, setAvatarKey as persistAvatarKey } from "@/lib/data";
import { defaultHandle, type Profile } from "@/lib/types";

export default function Settings() {
  const { session, ready } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarKey, setAvatarKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!session) return;
    profileByOwner(session.email).then((p) => {
      setProfile(p);
      setHandle(p?.handle ?? defaultHandle(session.email));
      setName(p?.name ?? session.email.split("@")[0]);
      setBio(p?.bio ?? "");
      setAvatarKey(p?.avatar_key ?? null);
    });
  }, [session]);

  if (ready && !session) {
    return (
      <>
        <div className="topbar"><h1>Settings</h1></div>
        <p className="center muted">Sign in first.</p>
      </>
    );
  }

  async function pickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !session) return;
    setBusy(true);
    setError(null);
    try {
      const { blob, originalBytes } = await prepareImage(file);
      const res = await fetchAuthed("/api/upload", {
        method: "POST",
        headers: { "Content-Type": blob.type },
        body: blob,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "upload failed");
      const key = (await res.json()).key as string;
      setAvatarKey(key);
      // Store it now rather than waiting for "Save profile": the photo is on the
      // page the moment it uploads, so anything less looks saved and is not.
      const err = profile
        ? await persistAvatarKey(session.email, key)
        : await saveProfile({
            owner: session.email,
            handle: handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, ""),
            name: name.trim() || handle,
            bio: bio.trim(),
            avatar_key: key,
            created_at: Date.now(),
          });
      if (err) throw new Error(err);
      setProfile((prev) => (prev ? { ...prev, avatar_key: key } : prev));
      setSaved(true);
      setError(null);
      console.info(`avatar resized ${formatBytes(originalBytes)} → ${formatBytes(blob.size)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!session) return setError("your session has expired — sign in again");
    const clean = handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (clean.length < 2) return setError("a handle needs at least two characters");
    setBusy(true);
    setError(null);
    // Handles are how people are addressed, so they must be unique.
    const taken = await profileByHandle(clean);
    if (taken && taken.owner !== session.email) {
      setBusy(false);
      return setError(`@${clean} is taken`);
    }
    const err = await saveProfile({
      owner: session.email,
      handle: clean,
      name: name.trim() || clean,
      bio: bio.trim(),
      avatar_key: avatarKey,
      created_at: profile?.created_at ?? Date.now(),
    });
    setBusy(false);
    if (err) return setError(err);
    setSaved(true);
    router.push(`/u/${clean}`);
  }

  return (
    <>
      <div className="topbar"><h1>Your profile</h1></div>
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <div className="avatar" style={{ width: 72, height: 72, fontSize: 26 }}>
            {avatarKey ? <img src={mediaUrl(avatarKey)} alt="" /> : (name || "?").slice(0, 1).toUpperCase()}
          </div>
          <button className="ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
            {avatarKey ? "Change photo" : "Add a photo"}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickAvatar} />
        </div>

        <label className="field">
          <span>Handle</span>
          <input type="text" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="ada" />
        </label>
        <label className="field">
          <span>Name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" />
        </label>
        <label className="field">
          <span>Bio</span>
          <textarea className="field" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Runs on OxiBase" />
        </label>

        {error && <div className="error" style={{ margin: "8px 0" }}>{error}</div>}
        {saved && <div className="notice">Saved.</div>}
        <button className="primary" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save profile"}
        </button>
      </div>
    </>
  );
}
