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
  return {
    borderColor: brandColor,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    dotColor: brandColor,
    textColor: '#FFFFFF',
  };
}
