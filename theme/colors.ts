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
export const ONBOARDING_RADAR_GRADIENT = {
  // Luminous Royal Sapphire crown tapering smoothly into deep midnight navy and OLED black floor
  colors: ['#003380', '#001C52', '#070E24', '#02040A'] as const,
  locations: [0, 0.28, 0.65, 1.0] as const,
  start: { x: 0.5, y: 0 },
  end: { x: 0.5, y: 1 },
};

export const ONBOARDING_GRADIENT = ONBOARDING_RADAR_GRADIENT;

export const SAPPHIRE_ATMOSPHERIC_BLOOM = {
  // Top-centered atmospheric sapphire optical bloom for specular glass card refraction
  colors: ['rgba(0, 102, 204, 0.24)', 'rgba(0, 51, 128, 0.08)', 'transparent'] as const,
  locations: [0, 0.45, 0.90] as const,
  start: { x: 0.5, y: 0 },
  end: { x: 0.5, y: 0.70 },
};

export const IMMINENT_BLUE = '#60A5FA';

export const CANVAS_LONDON_NIGHT = '#030818';

export const MASTER_CANVAS = {
  // Base Fixed Canvas for Vault (Radar) & Switchboard (Settings)
  VAULT_SETTINGS_BASE: '#070E24',
  VAULT_SETTINGS_GRADIENT: ['#002D7A', '#070E24', '#02040A'] as const,

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
  // Live optical blur intensity (authentic Apple frosted glass)
  blurIntensity: 35,
  // Optical material: dark material allows background saturation to shine through clearly
  blurTint: 'dark' as const,
  // Transparent base: zero chalky/smoggy white wash
  background: 'transparent',
  // Hairline perimeter specular rim
  borderColor: 'rgba(255, 255, 255, 0.18)',
  borderWidth: 1.0,
  // Directional fallbacks (authentic Apple liquid glass overhead lighting)
  borderTop: 'rgba(255, 255, 255, 0.35)',
  borderSides: 'rgba(255, 255, 255, 0.16)',
  borderSide: 'rgba(255, 255, 255, 0.16)',
  borderBottom: 'rgba(255, 255, 255, 0.10)',
  // Specular top-rim catch-light sheen (crisp overhead illumination)
  specularStart: 'rgba(255, 255, 255, 0.18)',
  specularEnd: 'rgba(255, 255, 255, 0.00)',
  // Zero shadows behind cards per design specification
  shadowColor: 'transparent',
  shadowOffset: { width: 0, height: 0 } as const,
  shadowOpacity: 0,
  shadowRadius: 0,
  elevation: 0,
};

export const PREMIUM_BUTTON = {
  background: 'rgba(255, 255, 255, 0.12)',
  borderWidth: 1.0,
  borderColor: 'rgba(255, 255, 255, 0.40)',
  borderTopColor: 'rgba(255, 255, 255, 0.60)',
  borderBottomColor: 'rgba(255, 255, 255, 0.35)',
  shadowColor: 'transparent',
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0,
  shadowRadius: 0,
  elevation: 0,
};

/** The interactive accent colour used across the app (not iOS blue) */
export const ACCENT_INTERACTIVE = '#0098D4';

export const DUE_TIME_STYLE = {
  color: '#FFFFFF',
  fontWeight: '700' as const,
};
