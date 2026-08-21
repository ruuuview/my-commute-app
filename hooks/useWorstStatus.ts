// hooks/useWorstStatus.ts
//
// Worst-status aggregation across the user's lines.
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
// NOTE: useLineData.ts currently passes through RAW TfL codes (not patched),
// so code→label is delegated to utils/getSeverityColor.ts — the single
// source of truth (AGENTS.md §0). Suspended/closure codes collapse into
// 'severe' (red) per the remediation plan.
//
// Community report upgrade rules (v4.1 §2.4):
//   reports ≥ 3  AND TfL shows 'good'  → upgrade to 'minor'
//   reports ≥ 5  AND TfL shows 'minor' → upgrade to 'severe'

import { useLineDataStore } from '../store/lineDataStore';
import { getSeverityLabel } from '../utils/getSeverityColor';

export type StatusLevel = 'good' | 'minor' | 'severe' | 'unknown';

// Severity ranking — higher number = worse status
const SEVERITY: Record<StatusLevel, number> = {
  unknown: 0,
  good: 1,
  minor: 2,
  severe: 3,
};

/**
 * Maps a TfL status_severity number to the canonical StatusLevel enum.
 * Delegated to the single source of truth (utils/getSeverityColor.ts):
 *   10,18,14 → good · 9,7 → minor · 6 → severe ·
 *   suspended/closure bucket (0,1,2,3,4,5,8,11,16,17,19,20) → severe.
 */
function severityToLevel(patchedSeverity: number | undefined): StatusLevel {
  return getSeverityLabel(patchedSeverity);
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
  let resolvedAny = false;

  const checkLevelAndReports = (level: StatusLevel, reports: number) => {
    if (level === 'good' && reports >= 3) return 'minor';
    if (level === 'minor' && reports >= 5) return 'severe';
    return level;
  };

  const OVERGROUND_BRANCH_IDS = ['liberty', 'lioness', 'mildmay', 'suffragette', 'weaver', 'windrush', 'overground'];

  for (const lineId of lines) {
    // Handle Overground aggregation
    if (lineId === 'overground') {
      let worstBranchLevel: StatusLevel = 'good';
      let resolvedBranch = false;
      for (const branchId of OVERGROUND_BRANCH_IDS) {
        const branchData = lineStatuses[branchId];
        if (!branchData) continue;
        resolvedBranch = true;
        const level = severityToLevel(branchData.status_severity);
        const reports = communityReports[branchId] ?? 0;
        const upgradedLevel = checkLevelAndReports(level, reports);
        
        if (SEVERITY[upgradedLevel] > SEVERITY[worstBranchLevel]) {
          worstBranchLevel = upgradedLevel;
        }
      }
      if (!resolvedBranch) continue;
      resolvedAny = true;
      if (SEVERITY[worstBranchLevel] > SEVERITY[worst]) {
        worst = worstBranchLevel;
      }
      continue;
    }

    const lineData = lineStatuses[lineId];
    if (!lineData) continue; // line not in store — skip
    resolvedAny = true;

    const level = severityToLevel(lineData.status_severity);
    const reports = communityReports[lineId] ?? 0;
    const upgradedLevel = checkLevelAndReports(level, reports);

    if (SEVERITY[upgradedLevel] > SEVERITY[worst]) worst = upgradedLevel;
  }

  return resolvedAny ? worst : 'unknown';
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
