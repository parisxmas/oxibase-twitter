"use client";

// Full-size view of a post's image.
//
// Built on the native <dialog>, which brings Escape-to-close, focus
// containment and inertness of the page behind it — all things a hand-rolled
// overlay gets wrong. The timeline crops to 5:3; here the whole image is shown.

import { useEffect, useRef } from "react";
import { IconClose } from "./icons";

export function Lightbox({
  src,
  alt = "",
  open,
  onClose,
}: {
  src: string;
  alt?: string;
  open: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="lightbox"
      onClose={onClose}
      // Clicking the backdrop closes: the dialog element itself *is* the
      // backdrop area, so a click landing on it rather than the image means
      // the reader clicked outside.
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <button className="lightbox-close" onClick={onClose} aria-label="Close">
        <IconClose size={22} />
      </button>
      <img src={src} alt={alt} />
    </dialog>
  );
}
