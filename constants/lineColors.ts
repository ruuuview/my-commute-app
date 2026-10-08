// constants/lineColors.ts
// Line IDENTITY colors (line chips/bars/brand accents). Severity colors are a
// SEPARATE token system (utils/getSeverityColor.ts) — never merged (AGENTS.md §0).
// Single Source of Truth: frontend/constants/lineColors.json

import lineColorsData from './lineColors.json';

export interface LineColorDefinition {
  name: string;
  hex: string;
  textColor: string;
  borderColor: string | null;
  specularColor?: string;
}

export const LINE_COLORS_DATA: Record<string, LineColorDefinition> = lineColorsData.lines;

export const LINE_IDENTITY_COLORS: Record<string, string> = {
  bakerloo: lineColorsData.lines.bakerloo.hex,
  central: lineColorsData.lines.central.hex,
  circle: lineColorsData.lines.circle.hex,
  district: lineColorsData.lines.district.hex,
  dlr: lineColorsData.lines.dlr.hex,
  elizabeth: lineColorsData.lines.elizabeth.hex,
  'hammersmith-city': lineColorsData.lines['hammersmith-city'].hex,
  jubilee: lineColorsData.lines.jubilee.hex,
  metropolitan: lineColorsData.lines.metropolitan.hex,
  northern: lineColorsData.lines.northern.hex,
  overground: lineColorsData.lines.overground.hex,
  piccadilly: lineColorsData.lines.piccadilly.hex,
  victoria: lineColorsData.lines.victoria.hex,
  'waterloo-city': lineColorsData.lines['waterloo-city'].hex,
  liberty: lineColorsData.lines.liberty.hex,
  lioness: lineColorsData.lines.lioness.hex,
  mildmay: lineColorsData.lines.mildmay.hex,
  suffragette: lineColorsData.lines.suffragette.hex,
  weaver: lineColorsData.lines.weaver.hex,
  windrush: lineColorsData.lines.windrush.hex,
};

export const LINE_NAMES: Record<string, string> = {
  bakerloo: lineColorsData.lines.bakerloo.name,
  central: lineColorsData.lines.central.name,
  circle: lineColorsData.lines.circle.name,
  district: lineColorsData.lines.district.name,
  dlr: lineColorsData.lines.dlr.name,
  elizabeth: lineColorsData.lines.elizabeth.name,
  'hammersmith-city': lineColorsData.lines['hammersmith-city'].name,
  jubilee: lineColorsData.lines.jubilee.name,
  metropolitan: lineColorsData.lines.metropolitan.name,
  northern: lineColorsData.lines.northern.name,
  overground: lineColorsData.lines.overground.name,
  piccadilly: lineColorsData.lines.piccadilly.name,
  victoria: lineColorsData.lines.victoria.name,
  'waterloo-city': lineColorsData.lines['waterloo-city'].name,
  liberty: lineColorsData.lines.liberty.name,
  lioness: lineColorsData.lines.lioness.name,
  mildmay: lineColorsData.lines.mildmay.name,
  suffragette: lineColorsData.lines.suffragette.name,
  weaver: lineColorsData.lines.weaver.name,
  windrush: lineColorsData.lines.windrush.name,
};

/**
 * Visible shades of obsidian/graphite for Northern line on dark canvas.
 * TfL Northern is officially Black (#000000). On black/dark backgrounds,
 * selection uses a physical specular lift (never a 70% black choking wash)
 * and a high-contrast specular rim (>= 3:1 contrast against dark canvas).
 */
export const NORTHERN_SHADES = {
  brand: lineColorsData.lines.northern.hex, // Canonical TfL Northern black (#000000)
  highlightBorder: lineColorsData.lines.northern.hex, // True black border (#000000)
  highlightBorderDark: '#121216', // Deep charcoal rim
  highlightWash: 'rgba(0, 0, 0, 0.18)', // Subtle obsidian dark depth
  shadowColor: '#000000', // Deep black shadow
  pillBorder: lineColorsData.lines.northern.specularColor ?? '#8A90A0', // Shiny obsidian pill rim
  pillBackground: 'rgba(10, 10, 14, 0.90)', // Deep carbon black pill fill
  accentBar: lineColorsData.lines.northern.hex, // Jet obsidian tone ensuring true black identity
  border: lineColorsData.lines.northern.borderColor ?? '#3A3A42', // Specular rim for black-on-black visibility
} as const;
