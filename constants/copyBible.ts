/**
 * copyBible.ts — Frontend In-App Microcopy & JIT Sheet Engine
 * 
 * Partition Invariant:
 * - Backend owns APNs push notification generation (backend/lib/copy.ts)
 * - Frontend owns in-app sheets, modals, empty states, and local UI feedback
 * 
 * Strict Voice Rules:
 * - Rule 6 Compliant: Money copy must use modal verbs ("might", "potential").
 * - Value-First: Never lead with apologies ("we hate creepy tracking too").
 * - Zero Confirmshaming: Secondary buttons are respectful choices, not guilt-trips.
 */

export interface JourneySlots {
  line?: string;
  delayMinutes?: number;
  station?: string;
  pence?: number;
}

/**
 * Poka-yoke: Format observed pence into compliant potential refund string.
 * Prevents raw literal injection like "£3.60" or unhedged assertions.
 */
export function formatPotentialRefund(pence?: number): string {
  if (typeof pence !== 'number' || isNaN(pence) || pence <= 0) {
    return 'potential refund';
  }
  const pounds = (pence / 100).toFixed(2);
  return `potential £${pounds}`;
}

export const IN_APP_COPY = {
  // ─── JIT PERMISSION SHEETS ──────────────────────────────────────────
  jitTrigger1: {
    // Value-first, scope-second, zero-apology
    title: 'Departure countdowns on your Lock Screen',
    body: (station = 'your station') =>
      `Pocket Detection automatically displays live train times the moment you walk within 200m of ${station}. Wakes up at your station, sleeps everywhere else. Zero continuous GPS drain.`,
    ctaPrimary: 'Put on Lock Screen',
    ctaSecondary: 'Keep It Manual',
  },

  jitTrigger2: {
    // High-context commute open
    title: 'Automate your morning departure board',
    body: (station = 'your station') =>
      `You\'re approaching ${station}. Enable Pocket Detection so your live train countdown appears automatically on your Lock Screen every morning — without having to unlock your phone.`,
    ctaPrimary: 'Automate My Mornings',
    ctaSecondary: 'Keep It Manual',
  },

  jitTrigger3: {
    // Rule 6 compliant: modal verb + verified by TfL
    title: (line = 'your train', delay = 20) =>
      `${delay}m delay on ${line} · Potential refund detected`,
    body: (amountText = 'potential refund') =>
      `This disruption may qualify for Delay Repay (${amountText}). Tap to prepare your claim — TfL confirms your journey against your card history and pays it right back.`,
    ctaPrimary: 'Review Potential Claim',
    ctaSecondary: 'Dismiss',
  },

  // ─── EMPTY STATES & AMBIENT UI ──────────────────────────────────────
  emptyRecentSearches: 'Search a station to see live arrivals and delays.',
  emptyPinned: 'Pin your daily Home and Work stations to start departure tracking.',
  offlineBanner: 'Underground with zero bars? Holding your latest timetable offline.',
  allGoodServiceBadge: '100% on time',
  
  // ─── SETTINGS AMBIENT SUBTITLES ─────────────────────────────────────
  settingsLocationPrompt: 'Pocket Detection: Wakes up at your station perimeter. Zero battery drain.',
  settingsLocationDemotedWarning: 'Pocket detection paused · Tap to restore Always location',
};
