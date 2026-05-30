/** Small inline SVG icons for inspector toolbars (16×16). */

import React from 'react';

const base: React.CSSProperties = { display: 'block', flexShrink: 0 };

export const IconExpand: React.FC<{ color?: string }> = ({ color = 'currentColor' }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" style={base} aria-hidden>
    <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

/** Expand inspector panel left (within canvas row). */
export const IconExpandPanel: React.FC<{ color?: string }> = ({ color = 'currentColor' }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" style={base} aria-hidden>
    <path d="M9 5H5v6h4M11 8h3" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
    <path d="M13 6v4" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

/** Restore inspector to default narrow width. */
export const IconRestorePanel: React.FC<{ color?: string }> = ({ color = 'currentColor' }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" style={base} aria-hidden>
    <rect x="9" y="4" width="5" height="8" rx="1" fill="none" stroke={color} strokeWidth="1.2" />
    <rect x="2" y="4" width="5" height="8" rx="1" fill={color} opacity="0.25" />
    <path d="M7 8H11" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

export const IconAdd: React.FC<{ color?: string }> = ({ color = 'currentColor' }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" style={base} aria-hidden>
    <path d="M8 3v10M3 8h10" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export const IconDelete: React.FC<{ color?: string }> = ({ color = 'currentColor' }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" style={base} aria-hidden>
    <path d="M4 5h8l-.8 7H4.8L4 5zM6 3h4l.5 2h-5L6 3z" fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
);

export const IconDrag: React.FC<{ color?: string }> = ({ color = 'currentColor' }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" style={base} aria-hidden>
    <circle cx="5" cy="5" r="1.2" fill={color} /><circle cx="11" cy="5" r="1.2" fill={color} />
    <circle cx="5" cy="11" r="1.2" fill={color} /><circle cx="11" cy="11" r="1.2" fill={color} />
  </svg>
);

export const IconChevron: React.FC<{ open?: boolean; color?: string }> = ({ open, color = 'currentColor' }) => (
  <svg width="12" height="12" viewBox="0 0 16 16" style={{ ...base, transform: open ? 'rotate(90deg)' : 'none' }} aria-hidden>
    <path d="M6 4l4 4-4 4" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconRoute: React.FC<{ color?: string }> = ({ color = 'currentColor' }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" style={base} aria-hidden>
    <path d="M3 8h4l2-3 4 7-2-3H9" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconFilter: React.FC<{ color?: string }> = ({ color = 'currentColor' }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" style={base} aria-hidden>
    <path d="M2 4h12L9 9v3l-2 1V9L2 4z" fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
);
