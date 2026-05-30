// theme/colors.ts
export const MASTER_BACKGROUND_GRADIENT = {
  // Luminous TfL deep navy base grid bleeding down to absolute pitch black
  colors: ['#002D7A', '#001E5A', '#000F2E', '#000408', '#000204'] as const,
  locations: [0, 0.22, 0.50, 0.78, 1.0] as const,
  start: { x: 0, y: 0 },
  end: { x: 0, y: 1 },
};

export const SCREEN_2_BACKGROUND_GRADIENT = {
  // Screen 2 deep transit navy base stack
  colors: ['#001E6B', '#001245', '#00091E', '#000306', '#000204'] as const,
  locations: [0, 0.25, 0.52, 0.78, 1.0] as const,
  start: { x: 0, y: 0 },
  end: { x: 0, y: 1 },
};

export const DASHBOARD_OVERLAY_GRADIENT = {
  // Universal edge overlay to ensure legibility and passes touches to list rows cleanly
  colors: ['transparent', 'transparent', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.72)', 'rgba(0,0,0,0.88)'] as const,
  locations: [0, 0.55, 0.72, 0.85, 1.0] as const,
  start: { x: 0, y: 0 },
  end: { x: 0, y: 1 },
  pointerEvents: 'none' as const,
};

export const UNIFIED_DARK_GRADIENT = {
  colors: ['#002D7A', '#001E5A', '#000F2E', '#000408', '#000204'] as const,
  locations: [0, 0.22, 0.50, 0.78, 1.0] as const,
  start: { x: 0, y: 0 },
  end: { x: 0, y: 1 },
};


