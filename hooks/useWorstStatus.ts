// hooks/useWorstStatus.ts
//
// The single source of truth for commute status severity across the entire app.
// All gradient colours, Dynamic Island tints, notification dots, and lock screen
// widgets derive their status from this hook — nothing computes severity elsewhere.
//
// IMPORTANT — severity values in store:
// useLineData.ts patches status_severity before writing to the store.
// The values are NOT raw TfL API codes. They are the patched set:
//
//   20  → suspended  (part closure / suspended / closure)
//    9  → severe     (severe delays)
//    5  → minor      (minor / part / reduced)
//    1  → good       (good service / catch-all)
//  missing/other → unknown
//
// Community report upgrade rules (v4.1 §2.4):
//   reports ≥ 3  AND TfL shows 'good'  → upgrade to 'minor'
//   reports ≥ 5  AND TfL shows 'minor' → upgrade to 'severe'

import { useLineDataStore } from '../store/lineDataStore';

export type StatusLevel = 'good' | 'minor' | 'severe' | 'suspended' | 'unknown';

// Severity ranking — higher number = worse status
const SEVERITY: Record<StatusLevel, number> = {
  unknown:   0,
  good:      1,
  minor:     2,
  severe:    3,
  suspended: 4,
};

/**
 * Maps the patched status_severity number from lineDataStore
 * to the canonical StatusLevel enum.
 */
function severityToLevel(patchedSeverity: number | undefined): StatusLevel {
  switch (patchedSeverity) {
    case 20: return 'suspended';
    case 9:  return 'severe';
    case 5:  return 'minor';
    case 1:  return 'good';
    default: return 'unknown';
  }
}

/**
 * Returns the worst StatusLevel across the given line IDs,
 * incorporating community report signal upgrades.
 *
 * @param lines - Array of TfL line IDs (e.g. ['jubilee', 'central'])
 * @returns The worst StatusLevel across all provided lines
 */
export function useWorstStatus(lines: string[]): StatusLevel {
  const lineStatuses      = useLineDataStore(s => s.lines);
  const communityReports  = useLineDataStore(s => s.communityReports);

  // No lines selected, or store hasn't received API data yet
  if (!lines.length || !Object.keys(lineStatuses).length) return 'unknown';

  let worst: StatusLevel = 'good';

  for (const lineId of lines) {
    const lineData = lineStatuses[lineId];
    if (!lineData) continue; // line not in store — skip, don't default to 'unknown'

    let level = severityToLevel(lineData.status_severity);
    const reports = communityReports[lineId] ?? 0;

    // Community signal upgrades — overrides TfL optimism
    if (reports >= 3 && level === 'good')  level = 'minor';
    if (reports >= 5 && level === 'minor') level = 'severe';

    if (SEVERITY[level] > SEVERITY[worst]) worst = level;
  }

  return worst;
}
