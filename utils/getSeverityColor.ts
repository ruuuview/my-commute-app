// utils/getSeverityColor.ts
// THE single source of truth for TfL status → severity label + color.
// Locked by AGENTS.md §0: no component may compute severity color independently.
// Every status→color decision in the app MUST route through this module.
//
// Canonical TfL statusSeverity code table (AGENTS.md §3 — do not diverge):
//   10, 18, 14 → good     (Good Service / Special Service / Information)
//    9,  7     → minor    (Minor Delays / Reduced Service)
//    6         → severe   (Severe Delays)
//    5, 4, 3, 0, 11, 8, 16, 17, 19, 1, 2, 20 → severe (Suspended / Part/Planned/
//                 Whole Closure / Bus Service / Not Running — collapsed into the
//                 3-tier 'severe' bucket per the remediation plan)
//
// Severity colors (app-wide canonical values):
//   good #30D158 · minor #FF9F0A · severe #FF3B30

export type Severity = 'good' | 'minor' | 'severe';

export interface SeverityColor {
  color: string;
  label: Severity;
}

export const STATUS_SEVERITY_COLORS: Record<Severity, string> = {
  good: '#30D158',
  minor: '#FF9F0A',
  severe: '#FF3B30',
};

const TFL_CODE_TO_SEVERITY: Record<number, Severity> = {
  10: 'good',
  18: 'good',
  14: 'good',
  9: 'minor',
  7: 'minor',
  6: 'severe',
  // suspended / closure bucket → severe (red)
  5: 'severe',
  4: 'severe',
  3: 'severe',
  0: 'severe',
  11: 'severe',
  8: 'severe',
  16: 'severe',
  17: 'severe',
  19: 'severe',
  1: 'severe',
  2: 'severe',
  20: 'severe',
};

function severityFromText(statusText: string): Severity | null {
  const text = String(statusText ?? '').toLowerCase();
  if (text.includes('good') && !text.includes('delay')) return 'good';
  if (text.includes('closure')) return 'severe';
  if (text.includes('suspended')) return 'severe';
  if (text.includes('bus')) return 'severe';
  if (text.includes('not running')) return 'severe';
  if (text.includes('closed')) return 'severe';
  if (text.includes('severe')) return 'severe';
  if (text.includes('minor')) return 'minor';
  if (text.includes('information')) return 'good';
  if (text.includes('reduced')) return 'minor';
  return null;
}

/**
 * Map a raw TfL status to the app's 3-tier severity label + display color.
 * Code takes precedence; text parsing is the fallback for missing codes.
 * Unrecognized input defaults to 'good' (parity with the pre-unification
 * dashboard behavior — offline/loading states are handled by callers).
 */
export function getSeverityColor(
  statusSeverity?: number,
  statusText?: string
): SeverityColor {
  if (statusSeverity !== undefined && statusSeverity in TFL_CODE_TO_SEVERITY) {
    const label = TFL_CODE_TO_SEVERITY[statusSeverity];
    return { color: STATUS_SEVERITY_COLORS[label], label };
  }
  const textLabel = severityFromText(String(statusText ?? ''));
  if (textLabel) {
    return { color: STATUS_SEVERITY_COLORS[textLabel], label: textLabel };
  }
  return { color: STATUS_SEVERITY_COLORS.good, label: 'good' };
}

/** Label-only variant (text/icon styling without needing the color). */
export function getSeverityLabel(statusSeverity?: number, statusText?: string): Severity {
  return getSeverityColor(statusSeverity, statusText).label;
}

const SEVERITY_RANK_MAP: Record<Severity, number> = {
  good: 0,
  minor: 1,
  severe: 2,
};

/**
 * Get canonical severity rank (0=good, 1=minor, 2=severe, 3=suspended/closure).
 * Delegates directly to the single source of truth for status parsing.
 */
export function getSeverityRank(statusSeverity?: number, statusText?: string): number {
  if (statusSeverity !== undefined) {
    if ([0, 11, 8, 16, 17, 19, 1, 2, 5, 4, 3, 20].includes(statusSeverity)) return 3; // suspended / closure
    if (statusSeverity === 6) return 2; // severe
    if (statusSeverity === 9 || statusSeverity === 7) return 1; // minor
    if (statusSeverity === 10 || statusSeverity === 18 || statusSeverity === 14) return 0; // good
  }
  const label = getSeverityLabel(statusSeverity, statusText);
  return SEVERITY_RANK_MAP[label] ?? 0;
}
