// constants/lineColors.ts
// Line IDENTITY colors (line chips/bars/brand accents). Severity colors are a
// SEPARATE token system (utils/getSeverityColor.ts) — never merged (AGENTS.md §0).

export const LINE_IDENTITY_COLORS: Record<string, string> = {
  bakerloo: '#B36305',
  central: '#E32017',
  circle: '#FFD300',
  district: '#00782A',
  dlr: '#00AFAD',
  elizabeth: '#6950A1',
  'hammersmith-city': '#F3A9BB',
  jubilee: '#868F98',
  metropolitan: '#9B0056',
  northern: '#000000',
  overground: '#EE7C0E',
  piccadilly: '#003688',
  victoria: '#0098D4',
  'waterloo-city': '#95CDBA',
  // Overground sub-branches
  weaver: '#EE7C0E',
  mildmay: '#EE7C0E',
  windrush: '#EE7C0E',
  suffragette: '#EE7C0E',
  lioness: '#EE7C0E',
  liberty: '#EE7C0E',
};

export const LINE_NAMES: Record<string, string> = {
  bakerloo: 'Bakerloo',
  central: 'Central',
  circle: 'Circle',
  district: 'District',
  dlr: 'DLR',
  elizabeth: 'Elizabeth',
  'hammersmith-city': 'Hammersmith & City',
  jubilee: 'Jubilee',
  metropolitan: 'Metropolitan',
  northern: 'Northern',
  overground: 'Overground',
  piccadilly: 'Piccadilly',
  victoria: 'Victoria',
  'waterloo-city': 'Waterloo & City',
};

/**
 * Visible shades of black for Northern line on dark/black canvas.
 * TfL Northern is officially Black (#000000). On black/dark backgrounds,
 * use elevated obsidian / graphite / charcoal black — NEVER white.
 */
export const NORTHERN_SHADES = {
  brand: '#000000', // Canonical TfL Northern black
  highlightBorder: '#3A3A42', // Visible charcoal/graphite black selection border
  highlightWash: 'rgba(36, 36, 42, 0.70)', // Visible elevated obsidian black fill
  shadowColor: '#000000', // Deep black shadow (never white)
  pillBorder: '#3A3A42', // Visible graphite black pill rim
  pillBackground: 'rgba(30, 30, 36, 0.85)', // Deep carbon black pill fill
  accentBar: '#18181C', // Jet obsidian tone ensuring edge visibility
} as const;
