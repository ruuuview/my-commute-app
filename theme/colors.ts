// theme/colors.ts
export const MASTER_BACKGROUND_GRADIENT = {  
  // Vivid & Mid TfL blue variations held all the way through the upper 75%
  colors: ['#0066CC', '#0055B3', '#003B8E', '#001240', '#000204'] as const,  
  locations: [0, 0.30, 0.75, 0.88, 1.0] as const,  
  start: { x: 0, y: 0 },  
  end: { x: 0, y: 1 },
};

export const SCREEN_2_BACKGROUND_GRADIENT = {  
  // Symmetrical screen 2 depth curve forcing a steep, deliberate drop to absolute black
  colors: ['#005FBF', '#004EA6', '#003380', '#001038', '#000204'] as const,  
  locations: [0, 0.32, 0.75, 0.89, 1.0] as const,  
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
export const ONBOARDING_GRADIENT = {
  colors: ['#07103a', '#07103a', '#040810'] as const,
  locations: [0, 0.35, 1.0] as const,
  start: { x: 0.5, y: 0 },
  end: { x: 0.5, y: 1 },
};
export const IMMINENT_BLUE = '#60A5FA';

// ─── Glassmorphism tokens (single source of truth) ─────────────────────────
export const GLASS = {
  background: 'rgba(255,255,255,0.07)',
  borderTop: 'rgba(255,255,255,0.35)',
  borderSide: 'rgba(255,255,255,0.08)',
  blurIntensity: 45,
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 8 } as const,
  shadowOpacity: 0.3,
  shadowRadius: 16,
};

export const PREMIUM_BUTTON = {
  background: 'rgba(255,255,255,0.12)',
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.30)',
  shadowOpacity: 0.15,
  shadowRadius: 6,
};

/** The interactive accent colour used across the app (not iOS blue) */
export const ACCENT_INTERACTIVE = '#0098D4';
