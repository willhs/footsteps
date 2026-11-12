// Small line icons for the map controls (16px, currentColor).
const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const MapIcon = () => (
  <svg {...base}>
    <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5V4l-6 2.5L9 4Z" />
    <path d="M9 4v13M15 6.5v13" />
  </svg>
);

export const GlobeIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3Z" />
  </svg>
);

export const TerrainIcon = () => (
  <svg {...base}>
    <path d="m3 19 6-10 4 6 2.5-3.5L21 19H3Z" />
    <circle cx="17" cy="6" r="1.6" />
  </svg>
);

export const PlainIcon = () => (
  <svg {...base}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <circle cx="9" cy="10" r="0.9" fill="currentColor" />
    <circle cx="14" cy="13" r="0.9" fill="currentColor" />
    <circle cx="11" cy="15.5" r="0.9" fill="currentColor" />
  </svg>
);

export const CloseIcon = () => (
  <svg {...base} width={14} height={14} strokeWidth={2}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
