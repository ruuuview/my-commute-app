// selectors/stationLines.ts
// THE single source of truth for line-filtering station arrivals.
// Locked by AGENTS.md §0: every station card imports this selector.
// No component computes its own line filter.
//
// Fixes the #5 bug class: station cards used to render ALL lineId values
// returned by TfL StopPoint/{id}/Arrivals, ignoring the user's selected
// lines from useUserPreferencesStore.selectedLines.

import { normaliseLineId } from '../utils/normaliseLineId';

/**
 * Filter raw TfL arrivals down to the user's selected lines.
 *
 * - Both sides are normalized via normaliseLineId so canonical dash-form
 *   line ids ('piccadilly') and raw API variants compare equal.
 * - An empty selection set is treated as "no filter" (show everything) —
 *   callers that require at least one line gate earlier.
 * - Generic over the row shape: accepts raw TfL arrivals (TflArrivalRow[])
 *   as well as the backend-normalised departure rows used by the render
 *   paths (NormalizedDeparture[]) — only `lineId` is read.
 */
const OVERGROUND_BRANCHES = new Set([
  'overground',
  'london-overground',
  'liberty',
  'lioness',
  'mildmay',
  'suffragette',
  'weaver',
  'windrush',
]);

export function getVisibleArrivals<T extends { lineId: string }>(
  allArrivals: T[],
  userSelectedLines: string[]
): T[] {
  if (!allArrivals || allArrivals.length === 0) return [];
  if (!userSelectedLines || userSelectedLines.length === 0) return allArrivals;

  const selected = new Set(
    userSelectedLines.map((line) => {
      const clean = normaliseLineId(line).cleanLineId;
      return OVERGROUND_BRANCHES.has(clean) ? 'overground' : clean;
    })
  );

  return allArrivals.filter((arrival) => {
    const clean = normaliseLineId(arrival.lineId).cleanLineId;
    const finalId = OVERGROUND_BRANCHES.has(clean) ? 'overground' : clean;
    return selected.has(finalId);
  });
}
