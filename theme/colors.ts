// theme/colors.ts
export const MASTER_BACKGROUND_GRADIENT = {
  // Luminous indigo-navy bleeding from the top notch down to an absolute deep canvas black
  colors: ['#0A122C', '#060B1E', '#020307', '#000000'] as const,
  locations: [0, 0.42, 0.75, 1.0] as const,
  start: { x: 0, y: 0 },
  end: { x: 0, y: 1 },
};

export const DASHBOARD_OVERLAY_GRADIENT = {
  // Fades in 55% down the viewport, ensuring high-contrast depth for action buttons
  colors: ['transparent', 'transparent', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.72)', 'rgba(0,0,0,0.92)'] as const,
  locations: [0, 0.55, 0.72, 0.85, 1.0] as const,
  start: { x: 0, y: 0 },
  end: { x: 0, y: 1 },
  pointerEvents: 'none' as const // Essential: guarantees touches pass through cleanly
};

export const UNIFIED_DARK_GRADIENT = {
  // Backwards compatibility pointer
  colors: ['#0A122C', '#060B1E', '#020307', '#000000'] as const,
  locations: [0, 0.42, 0.75, 1.0] as const,
  start: { x: 0, y: 0 },
  end: { x: 0, y: 1 },
};

