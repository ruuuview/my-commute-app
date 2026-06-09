// utils/normaliseLineId.ts
//
// Normalises raw TfL line strings (e.g. "Hammersmith & City Line") to standardised
// key forms (e.g. lineId: "hammersmith & city", cleanLineId: "hammersmith-city")
// for indexing line metadata and colors.

export interface NormalisedLine {
  lineId: string;
  cleanLineId: string;
}

export function normaliseLineId(lineName: string): NormalisedLine {
  const lineId = String(lineName || '').toLowerCase().replace(' line', '').trim();
  const cleanLineId = lineId.replace(/\s*&\s*/g, '-').replace(/\s+/g, '-');
  return { lineId, cleanLineId };
}
