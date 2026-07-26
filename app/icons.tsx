// Inline SVG icons.
//
// Text glyphs (◎ ⌕ ❏ ⏻) came from different Unicode blocks, so they had
// mismatched weights, sizes and baselines. These are one stroke width on one
// 24×24 grid, drawn in `currentColor` so they inherit whatever the surrounding
// text is doing — including the active/liked colours. No icon dependency.

type IconProps = { size?: number; filled?: boolean; className?: string };

function Svg({
  size = 24,
  className,
  filled = false,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 9.5 12 2.5l9 7V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M9.5 22v-8h5v8" fill="none" />
  </Svg>
);

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7.5" />
    <path d="m21 21-4.6-4.6" />
  </Svg>
);

export const IconBell = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 8-2.5 8h17S18 14.5 18 8.5" />
    <path d="M13.7 20.5a2 2 0 0 1-3.4 0" />
  </Svg>
);

export const IconBookmark = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 21.5 12 16.4 5 21.5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </Svg>
);

export const IconUser = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
  </Svg>
);

export const IconSettings = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2v2.6M12 19.4V22M4.9 4.9l1.9 1.9M17.2 17.2l1.9 1.9M2 12h2.6M19.4 12H22M4.9 19.1l1.9-1.9M17.2 6.8l1.9-1.9" />
  </Svg>
);

export const IconLogout = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 21H5.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16.5 16.5 4.5-4.5-4.5-4.5" />
    <path d="M21 12H9.5" />
  </Svg>
);

/** Post actions. */
export const IconReply = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 11.6a8 8 0 0 1-8.4 8 8.6 8.6 0 0 1-3.6-.85L4 20.5l1.75-4.9A8 8 0 0 1 12.6 3.6a8 8 0 0 1 8.4 8z" />
  </Svg>
);

export const IconRepost = (p: IconProps) => (
  <Svg {...p}>
    <path d="m16.5 2.5 3.5 3.5-3.5 3.5" />
    <path d="M4 12V9.5a3.5 3.5 0 0 1 3.5-3.5H20" />
    <path d="M7.5 21.5 4 18l3.5-3.5" />
    <path d="M20 12v2.5a3.5 3.5 0 0 1-3.5 3.5H4" />
  </Svg>
);

export const IconHeart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 20.7 4.2 13a4.9 4.9 0 0 1 0-6.9 4.9 4.9 0 0 1 6.9 0l.9.9.9-.9a4.9 4.9 0 0 1 6.9 0 4.9 4.9 0 0 1 0 6.9z" />
  </Svg>
);

export const IconChart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20V13M10 20V4M16 20v-5M22 20H2" />
  </Svg>
);

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6.5h16M9.5 6.5V4.2a1.2 1.2 0 0 1 1.2-1.2h2.6a1.2 1.2 0 0 1 1.2 1.2v2.3" />
    <path d="M6.5 6.5 7.4 20a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9l.9-13.5" />
  </Svg>
);

export const IconImage = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <circle cx="8.5" cy="9.5" r="1.6" />
    <path d="m3.5 17.5 4.7-4.4a2 2 0 0 1 2.7 0l6.6 6.2" />
  </Svg>
);

export const IconEmoji = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
    <path d="M9 9.5h.01M15 9.5h.01" />
  </Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);

export const IconBack = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 12H5" />
    <path d="m11.5 5.5-6.5 6.5 6.5 6.5" />
  </Svg>
);
