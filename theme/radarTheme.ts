// theme/radarTheme.ts
// Refund Radar Financial Terminal — design tokens (Radar v2 redesign).
//
// Layering contract: frosted-glass MECHANICS (BlurView intensity/tint,
// hairline borders, shadows) stay owned by theme/colors.ts (GLASS /
// PREMIUM_BUTTON). RADAR adds only what the terminal redesign genuinely
// introduces: surface fills tuned for the Obsidian base, signal-state
// colors, statutory constants, and TfL brand pass-through (single source:
// constants/lineColors.ts — never duplicated here, per AGENTS.md §0).

import { GLASS } from './colors';
import { LINE_IDENTITY_COLORS, LINE_NAMES } from '../constants/lineColors';

// ── Core palette ────────────────────────────────────────────────────────────
export const RADAR = {
  /** Deep-space base behind the terminal surfaces */
  obsidian: '#0B101B',
  /** Translucent navy card fill laid OVER BlurView(tint="dark") — replaces ad-hoc rgba(10,15,60,*) fills */
  glassFill: 'rgba(18, 26, 43, 0.75)',
  /** Hairline container border — value-identical to GLASS.borderSide */
  border: GLASS.borderSide,
  /** Signal-state colors ("Signal Lock" choreography) */
  signalClear: '#10B981', // emerald — all clear
  signalAction: '#F59E0B', // amber — action required / eligible
} as const;

// ── Statutory rules (display copy + chip labels) ───────────────────────────
// ENFORCEMENT lives backend-side (backend/lib/eligibility.ts — 15/30 min,
// 28-day window). These mirror the thresholds for UI copy ONLY. Frontend
// code must never branch claim eligibility on these values.
export const STATUTORY_THRESHOLDS = {
  TUBE_DLR_MINUTES: 15,
  ELIZABETH_OVERGROUND_MINUTES: 30,
} as const;

export const CLAIM_WINDOW_DAYS = 28;

/** Mirrors services/refundSlaService.DUE_CLAIM_WORKING_DAYS (10). */
export const SLA_REVIEW_WORKING_DAYS = 10;
/** Mirrors services/refundSlaService.SNOOZE_WINDOW_DAYS (3). */
export const SURVEY_SNOOZE_DAYS = 3;

export const FARE_DISCLAIMER =
  'TfL determines final payout based on your daily cap or Travelcard status.';

// ── 3-State cause classifier presentation map ──────────────────────────────
// Classification itself arrives from the backend (`causeEligible` +
// `status: 'unverified'`). This map only carries label + color.
export type CauseClassification = 'ELIGIBLE' | 'INELIGIBLE' | 'UNVERIFIED';

export const CAUSE_CLASSIFIER: Record<
  CauseClassification,
  { label: string; color: string }
> = {
  ELIGIBLE: { label: 'Eligible', color: RADAR.signalAction },
  INELIGIBLE: { label: 'Not Eligible', color: 'rgba(255,255,255,0.35)' },
  UNVERIFIED: { label: 'Unverified', color: 'rgba(255,255,255,0.55)' },
};

// ── TfL line brand pass-through (single source) ────────────────────────────
export const RADAR_LINE_BRAND = LINE_IDENTITY_COLORS;
export const RADAR_LINE_NAMES = LINE_NAMES;

/**
 * Northern line runs pure black (#000000) — invisible on dark glass.
 * Chips call this for their outline color; every other line is transparent.
 */
export function lineChipBorderColor(lineId: string): string {
  return lineId === 'northern' ? 'rgba(255,255,255,0.45)' : 'transparent';
}
