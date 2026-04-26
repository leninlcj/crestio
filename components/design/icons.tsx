// Small monochrome stroke icons sized for use in empty states (24px)
// and other inline contexts. Kept here so call sites don't reinvent them.

type IconProps = { className?: string; size?: number };

function Svg({
  size = 24,
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconCalendar = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Svg>
);

export const IconUsers = (p: IconProps) => (
  <Svg {...p}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
    <circle cx="10" cy="7" r="4" />
    <path d="M21 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </Svg>
);

export const IconUser = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
  </Svg>
);

export const IconHome = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V9.5z" />
  </Svg>
);

export const IconInvoice = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3h10l4 4v14H6z" />
    <path d="M8 10h8M8 14h8M8 18h4" />
  </Svg>
);

export const IconFolder = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z" />
  </Svg>
);

export const IconBook = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5zM18 19v2H6a2 2 0 0 1 0-4h12" />
  </Svg>
);

export const IconMessage = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 12a8 8 0 0 1-12.4 6.7L3 21l1.5-5.2A8 8 0 1 1 21 12z" />
  </Svg>
);

export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

export const IconCoin = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9 9.5a2.5 2.5 0 0 1 2.5-2.5h1A2.5 2.5 0 0 1 15 9.5c0 1.4-1 2-2.5 2.5S10 13 10 14.5A2.5 2.5 0 0 0 12.5 17h1A2.5 2.5 0 0 0 16 14.5M12 5v2M12 17v2" />
  </Svg>
);

export const IconHouseholds = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 11l9-7 9 7" />
    <path d="M5 10v10h14V10" />
    <path d="M9 21v-6h6v6" />
  </Svg>
);

export const IconArchive = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3H3V5z" />
    <path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4" />
  </Svg>
);
