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

export const CANVAS_LONDON_NIGHT = '#030818';

export const MASTER_CANVAS = {
  // Base Fixed Canvas for Vault (Radar) & Switchboard (Settings)
  VAULT_SETTINGS_BASE: '#070C1C',
  VAULT_SETTINGS_GRADIENT: ['#0A163A', '#070C1C', '#030818'] as const,

  // Atmospheric Dynamic Washes for Dashboard (Worst-Line Driven)
  DASHBOARD_GOOD: ['#0B1B3A', '#07162C', '#030818'] as const, // Deep Royal Navy
  DASHBOARD_MINOR: ['#221200', '#140A00', '#030818'] as const, // Dark Amber Copper
  DASHBOARD_SEVERE: ['#280204', '#150102', '#030818'] as const, // Dark Crimson Obsidian
  DASHBOARD_OFFLINE: ['#121824', '#0B101B', '#030818'] as const, // Neutral Dark Muted

  // Functional Accents (App-Wide Standard)
  CYAN_TELEMETRY: '#0098D4', // Live Radar Scan, TfL Links, Telemetry
  EMERALD_PROTECT: '#34D399', // 28-Day Active, Money Won, Good Service Dot
  AMBER_EXPOSURE: '#F59E0B', // 7-Day Limit, Minor Delay Dot
  CRIMSON_ALERT: '#EF4444', // Severe Disruption Dot, Destructive Actions
} as const;

export const SETTINGS_BACKGROUND_GRADIENT = {
  // Luminous royal sapphire to deep midnight navy atmosphere
  colors: MASTER_CANVAS.VAULT_SETTINGS_GRADIENT,
  locations: [0, 0.50, 1.0] as const,
  start: { x: 0.5, y: 0 },
  end: { x: 0.5, y: 1 },
};

// ─── Glassmorphism tokens (single source of truth) ─────────────────────────
export const GLASS = {
  // Live optical blur intensity (upgraded to 50 for authentic Apple frosted glass)
  blurIntensity: 50,
  // Card base frosted tint (creates distinct glass body substance against vibrant/dark backgrounds)
  background: 'rgba(255, 255, 255, 0.08)',
  // Hardware-accelerated uniform perimeter rim (CoreAnimation GPU native)
  borderColor: 'rgba(255, 255, 255, 0.28)',
  borderWidth: 1.25,
  // Directional fallbacks
  borderTop: 'rgba(255, 255, 255, 0.45)',
  borderSides: 'rgba(255, 255, 255, 0.28)',
  borderSide: 'rgba(255, 255, 255, 0.28)',
  borderBottom: 'rgba(255, 255, 255, 0.16)',
  // Specular top-rim catch-light sheen (makes top edge brightly illuminated)
  specularStart: 'rgba(255, 255, 255, 0.32)',
  specularEnd: 'rgba(255, 255, 255, 0.00)',
  // Zero shadows behind cards (clean glass aesthetic)
  shadowColor: 'transparent',
  shadowOffset: { width: 0, height: 0 } as const,
  shadowOpacity: 0,
  shadowRadius: 0,
  elevation: 0,
};

export const PREMIUM_BUTTON = {
  background: 'rgba(255, 255, 255, 0.12)',
  borderWidth: 1.25,
  borderColor: 'rgba(255, 255, 255, 0.38)',
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.45,
  shadowRadius: 8,
  elevation: 4,
};

/** The interactive accent colour used across the app (not iOS blue) */
export const ACCENT_INTERACTIVE = '#0098D4';

export const DUE_TIME_STYLE = {
  color: '#FFFFFF',
  fontWeight: '700' as const,
};
