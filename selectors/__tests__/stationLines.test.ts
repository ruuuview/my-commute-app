// selectors/__tests__/stationLines.test.ts
// Phase 2 invariant: every arrivals render path routes through
// getVisibleArrivals (AGENTS.md §0) — no component computes its own filter.

import { getVisibleArrivals } from '../stationLines';

interface MockArrival {
  id: string;
  lineId: string;
  lineName: string;
  destinationName: string;
  platformName: string;
  expectedArrival: string;
  timeToStation: number;
  currentLocation: string;
}

function makeArrival(lineId: string, lineName: string, index: number): MockArrival {
  return {
    id: `${lineId}-${index}`,
    lineId,
    lineName,
    destinationName: 'Mock destination',
    platformName: 'Platform 1',
    expectedArrival: '2026-07-31T08:00:00Z',
    timeToStation: 60 + index * 30,
    currentLocation: 'Between stations',
  };
}

describe('getVisibleArrivals', () => {
  const northern = makeArrival('northern', 'Northern', 0);
  const northern2 = makeArrival('northern', 'Northern', 1);
  const piccadilly = makeArrival('piccadilly', 'Piccadilly', 0);

  it('filters out lines not in the user selection', () => {
    const result = getVisibleArrivals([northern, piccadilly, northern2], ['piccadilly']);

    expect(result).toHaveLength(1);
    expect(result[0].lineId).toBe('piccadilly');
    expect(result.some(a => a.lineId === 'northern')).toBe(false);
  });

  it('passes everything through when the selection is empty', () => {
    const all = [northern, piccadilly, northern2];
    const result = getVisibleArrivals(all, []);

    expect(result).toHaveLength(3);
    expect(result.map(a => a.id)).toEqual(all.map(a => a.id));
  });

  it('passes everything through when the selection is missing', () => {
    const all = [northern, piccadilly];
    expect(getVisibleArrivals(all, undefined as any)).toHaveLength(2);
  });

  it('returns [] when there are no arrivals', () => {
    expect(getVisibleArrivals([], ['piccadilly'])).toEqual([]);
  });

  it('normalizes raw API line names on the arrival side', () => {
    // Raw TfL API variant 'Overground' vs canonical user selection 'overground'
    const rawOverground = makeArrival('Overground', 'Overground', 0);
    const result = getVisibleArrivals([northern, rawOverground], ['overground']);

    expect(result).toHaveLength(1);
    expect(result[0].lineId).toBe('Overground');
  });

  it('normalizes the user-side selection', () => {
    // Canonical arrival lineId vs raw user selection 'Piccadilly'
    const result = getVisibleArrivals([northern, piccadilly], ['Piccadilly']);

    expect(result).toHaveLength(1);
    expect(result[0].lineId).toBe('piccadilly');
  });

  it('matches "&" name variants (Hammersmith & City vs hammersmith-city)', () => {
    const hc = makeArrival('hammersmith-city', 'Hammersmith & City', 0);
    const result = getVisibleArrivals([hc, piccadilly], ['Hammersmith & City']);

    expect(result).toHaveLength(1);
    expect(result[0].lineId).toBe('hammersmith-city');
  });
});
