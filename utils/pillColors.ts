import { NORTHERN_SHADES } from '../constants/lineColors';

// utils/pillColors.ts
//
// Resolves readable contrast variants (borders, background tints, text/dot colors)
// for dark/low-contrast TfL lines (like Northern, Piccadilly, Bakerloo, etc.).

export interface PillColors {
  borderColor: string;
  backgroundColor: string;
  dotColor: string;
  textColor: string;
}

export function getPillColors(lineId: string, brandColor: string): PillColors {
  const isNorthern = lineId.toLowerCase().includes('northern') || brandColor === '#000000';
  if (isNorthern) {
    return {
      borderColor: NORTHERN_SHADES.pillBorder, // Visible charcoal/graphite black border, never white
      backgroundColor: NORTHERN_SHADES.pillBackground, // Deep carbon black pill body
      dotColor: NORTHERN_SHADES.brand, // True black dot (#000000)
      textColor: '#FFFFFF',
    };
  }

  return {
    borderColor: brandColor,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    dotColor: brandColor,
    textColor: '#FFFFFF',
  };
}
