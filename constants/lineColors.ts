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
  // Overground lines
  liberty: 'Liberty',
  lioness: 'Lioness',
  mildmay: 'Mildmay',
  suffragette: 'Suffragette',
  weaver: 'Weaver',
  windrush: 'Windrush',
};

/**
 * Visible shades of obsidian/graphite for Northern line on dark canvas.
 * TfL Northern is officially Black (#000000). On black/dark backgrounds,
 * selection uses a physical specular lift (never a 70% black choking wash)
 * and a high-contrast specular rim (>= 3:1 contrast against dark canvas).
 */
export const NORTHERN_SHADES = {
  brand: '#000000', // Canonical TfL Northern black
  highlightBorder: '#FFFFFF', // Specular diamond/platinum shiny rim (19:1 contrast against #0A1128)
  highlightBorderDark: '#62697A', // Specular obsidian shadow rim (6:1 contrast)
  highlightWash: 'rgba(0, 0, 0, 0.72)', // Deep inky obsidian black wash — darker than canvas, preserving black identity
  shadowColor: '#000000', // Deep black shadow (never white)
  pillBorder: '#8A90A0', // Shiny obsidian pill rim (6.5:1 contrast)
  pillBackground: 'rgba(10, 10, 14, 0.90)', // Deep carbon black pill fill
  accentBar: '#000000', // Jet obsidian tone ensuring true black identity
} as const;
