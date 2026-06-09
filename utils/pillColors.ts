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
  // Dark/low-contrast lines — resolve readable variants
  if (lineId === 'northern') {
    return {
      borderColor: 'rgba(255, 255, 255, 0.25)',
      backgroundColor: 'rgba(255, 255, 255, 0.10)',
      dotColor: '#FFFFFF',
      textColor: 'rgba(255, 255, 255, 0.80)',
    };
  }
  if (lineId === 'piccadilly') {
    return {
      borderColor: '#60A5FA66',
      backgroundColor: '#60A5FA1A',
      dotColor: '#003688',
      textColor: '#60A5FA',
    };
  }
  if (lineId === 'bakerloo') {
    return {
      borderColor: '#F59E0B66',
      backgroundColor: '#F59E0B1A',
      dotColor: '#B36305',
      textColor: '#F59E0B',
    };
  }
  if (lineId === 'jubilee') {
    return {
      borderColor: '#C8CDD166',
      backgroundColor: '#C8CDD11A',
      dotColor: '#868F98',
      textColor: '#FFFFFF',
    };
  }
  if (lineId === 'circle') {
    return {
      borderColor: '#FFD30066',
      backgroundColor: '#FFD3001A',
      dotColor: '#FFD300',
      textColor: '#FFFFFF',
    };
  }
  if (lineId === 'hammersmith-city') {
    return {
      borderColor: '#F3A9BB66',
      backgroundColor: '#F3A9BB1A',
      dotColor: '#F3A9BB',
      textColor: '#FFFFFF',
    };
  }
  // All other lines — brand color direct with 10% opacity
  return {
    borderColor: `${brandColor}66`,
    backgroundColor: `${brandColor}1A`,
    dotColor: brandColor,
    textColor: brandColor,
  };
}
