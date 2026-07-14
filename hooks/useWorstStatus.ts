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
//
// Community report upgrade rules (v4.1 §2.4):
//   reports ≥ 3  AND TfL shows 'good'  → upgrade to 'minor'
//   reports ≥ 5  AND TfL shows 'minor' → upgrade to 'severe'
//
// NOTE: useLineData.ts currently passes through RAW TfL codes (not patched).

import { useLineDataStore } from '../store/lineDataStore';

export type StatusLevel = 'good' | 'minor' | 'severe' | 'suspended' | 'unknown';

// Severity ranking — higher number = worse status
const SEVERITY: Record<StatusLevel, number> = {
  unknown: 0,
  good: 1,
  minor: 2,
  severe: 3,
  suspended: 4,
};

/**
 * Maps the raw TfL status_severity number from lineDataStore
 * to the canonical StatusLevel enum.
 * 
 * Canonical mapping (all files use this table):
 *   10,18,14 → good     (Good Service / Special Service / Information)
 *   5        → minor    (Minor Delays)
 *   9,6,7,4,3 → severe  (Severe Delays / Part Suspended / Planned Closure)
 *   0,11,8,16,17,19,1,2 → suspended (Suspended / Not Running / Bus Service / Service Closed)
 *   20       → unknown  (Unknown)
 */
function severityToLevel(patchedSeverity: number | undefined): StatusLevel {
  const code = patchedSeverity ?? 10;
  if (code === 10 || code === 18 || code === 14) return 'good';
  if (code === 5) return 'minor';
  if (code === 9 || code === 6 || code === 7 || code === 4 || code === 3) return 'severe';
  if ([0, 11, 8, 16, 17, 19, 1, 2].includes(code)) return 'suspended';
  if (code === 20) return 'unknown';
  return 'unknown';
}

/**
 * Pure helper function to compute the worst status level synchronously.
 */
export function computeWorstStatus(
  lines: string[],
  lineStatuses: Record<string, import('../store/lineDataStore').LineStatus>,
  communityReports: Record<string, number>
): StatusLevel {
  if (!lines.length || !Object.keys(lineStatuses).length) return 'unknown';

  let worst: StatusLevel = 'good';

  const checkLevelAndReports = (level: StatusLevel, reports: number) => {
    let upgradedLevel = level;
    if (reports >= 3 && upgradedLevel === 'good')  upgradedLevel = 'minor';
    if (reports >= 5 && upgradedLevel === 'minor') upgradedLevel = 'severe';
    return upgradedLevel;
  };

  const OVERGROUND_BRANCH_IDS = ['liberty', 'lioness', 'mildmay', 'suffragette', 'weaver', 'windrush', 'overground'];

  for (const lineId of lines) {
    // Handle Overground aggregation
    if (lineId === 'overground') {
      let worstBranchLevel: StatusLevel = 'good';
      for (const branchId of OVERGROUND_BRANCH_IDS) {
        const branchData = lineStatuses[branchId];
        if (!branchData) continue;
        const level = severityToLevel(branchData.status_severity);
        const reports = communityReports[branchId] ?? 0;
        const upgradedLevel = checkLevelAndReports(level, reports);
        
        if (SEVERITY[upgradedLevel] > SEVERITY[worstBranchLevel]) {
          worstBranchLevel = upgradedLevel;
        }
      }
      if (SEVERITY[worstBranchLevel] > SEVERITY[worst]) {
        worst = worstBranchLevel;
      }
      continue;
    }

    const lineData = lineStatuses[lineId];
    if (!lineData) continue; // line not in store — skip

    const level = severityToLevel(lineData.status_severity);
    const reports = communityReports[lineId] ?? 0;
    const upgradedLevel = checkLevelAndReports(level, reports);

    if (SEVERITY[upgradedLevel] > SEVERITY[worst]) worst = upgradedLevel;
  }

  return worst;
}

/**
 * Returns the worst StatusLevel across the given line IDs,
 * incorporating community report signal upgrades.
 *
 * @param lines - Array of TfL line IDs (e.g. ['jubilee', 'central'])
 * @returns The worst StatusLevel across all provided lines
 */
export function useWorstStatus(lines: string[]): StatusLevel {
  const lineStatuses = useLineDataStore(s => s.lines);
  const communityReports = useLineDataStore(s => s.communityReports);

  return computeWorstStatus(lines, lineStatuses, communityReports);
}
