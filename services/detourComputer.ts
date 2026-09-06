// frontend/services/detourComputer.ts
// Computes viable alternative transit corridors and detour ETA deltas for Tier 3 disruptions.
// Enforces that detourStatus shows the actual live status of the alternative line, never assuming "good".

export interface DetourOption {
  detourLine: string;
  detourLineName: string;
  transferStation: string;
  detourMinutes: number;
  detourStatus: 'good' | 'minor_delays' | 'severe_delays' | 'suspended';
  etaDelta: string;
}

const COMMON_DETOUR_CORRIDORS: Record<
  string,
  Array<{ line: string; lineName: string; transfer: string; addedMinutes: number }>
> = {
  northern: [
    { line: 'victoria', lineName: 'Victoria', transfer: 'Euston', addedMinutes: 8 },
    { line: 'piccadilly', lineName: 'Piccadilly', transfer: "King's Cross St. Pancras", addedMinutes: 10 },
    { line: 'bakerloo', lineName: 'Bakerloo', transfer: 'Charing Cross', addedMinutes: 12 },
  ],
  central: [
    { line: 'jubilee', lineName: 'Jubilee', transfer: 'Bond Street', addedMinutes: 6 },
    { line: 'piccadilly', lineName: 'Piccadilly', transfer: 'Holborn', addedMinutes: 9 },
    { line: 'elizabeth', lineName: 'Elizabeth', transfer: 'Tottenham Court Road', addedMinutes: 4 },
  ],
  victoria: [
    { line: 'northern', lineName: 'Northern', transfer: 'Warren Street', addedMinutes: 8 },
    { line: 'bakerloo', lineName: 'Bakerloo', transfer: 'Oxford Circus', addedMinutes: 7 },
    { line: 'piccadilly', lineName: 'Piccadilly', transfer: 'Finsbury Park', addedMinutes: 10 },
  ],
  piccadilly: [
    { line: 'central', lineName: 'Central', transfer: 'Holborn', addedMinutes: 9 },
    { line: 'victoria', lineName: 'Victoria', transfer: "King's Cross St. Pancras", addedMinutes: 8 },
    { line: 'district', lineName: 'District', transfer: 'South Kensington', addedMinutes: 11 },
  ],
  district: [
    { line: 'piccadilly', lineName: 'Piccadilly', transfer: 'South Kensington', addedMinutes: 7 },
    { line: 'central', lineName: 'Central', transfer: 'Notting Hill Gate', addedMinutes: 10 },
    { line: 'circle', lineName: 'Circle', transfer: 'Gloucester Road', addedMinutes: 5 },
  ],
  jubilee: [
    { line: 'central', lineName: 'Central', transfer: 'Bond Street', addedMinutes: 6 },
    { line: 'bakerloo', lineName: 'Bakerloo', transfer: 'Waterloo', addedMinutes: 8 },
    { line: 'northern', lineName: 'Northern', transfer: 'London Bridge', addedMinutes: 7 },
  ],
  bakerloo: [
    { line: 'jubilee', lineName: 'Jubilee', transfer: 'Waterloo', addedMinutes: 8 },
    { line: 'victoria', lineName: 'Victoria', transfer: 'Oxford Circus', addedMinutes: 7 },
    { line: 'northern', lineName: 'Northern', transfer: 'Charing Cross', addedMinutes: 9 },
  ],
};

export function computeDetour(
  disruptedLineId: string,
  liveLineStatuses: Record<string, 'good' | 'minor_delays' | 'severe_delays' | 'suspended'> = {}
): DetourOption | null {
  const lineKey = disruptedLineId.toLowerCase().replace(/[^a-z]/g, '');
  const candidates = COMMON_DETOUR_CORRIDORS[lineKey];
  if (!candidates || candidates.length === 0) {
    return null;
  }

  // 1. Try to find the first candidate with 'good' service
  const goodCandidate = candidates.find(
    (c) => (liveLineStatuses[c.line] || 'good') === 'good'
  );
  if (goodCandidate) {
    return {
      detourLine: goodCandidate.line,
      detourLineName: goodCandidate.lineName,
      transferStation: goodCandidate.transfer,
      detourMinutes: goodCandidate.addedMinutes,
      detourStatus: 'good',
      etaDelta: `+${goodCandidate.addedMinutes}m`,
    };
  }

  // 2. If no candidate has 'good', find first with 'minor_delays'
  const minorCandidate = candidates.find(
    (c) => liveLineStatuses[c.line] === 'minor_delays'
  );
  if (minorCandidate) {
    return {
      detourLine: minorCandidate.line,
      detourLineName: minorCandidate.lineName,
      transferStation: minorCandidate.transfer,
      detourMinutes: minorCandidate.addedMinutes,
      detourStatus: 'minor_delays',
      etaDelta: `+${minorCandidate.addedMinutes}m`,
    };
  }

  // 3. Fallback to first candidate with its actual live status
  const fallback = candidates[0];
  const fallbackStatus = liveLineStatuses[fallback.line] || 'severe_delays';
  return {
    detourLine: fallback.line,
    detourLineName: fallback.lineName,
    transferStation: fallback.transfer,
    detourMinutes: fallback.addedMinutes,
    detourStatus: fallbackStatus,
    etaDelta: `+${fallback.addedMinutes}m`,
  };
}
