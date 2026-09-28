// utils/shushPillPolicy.ts
// Policy for the "Shush today" morph pill.
//
// WHAT: decides whether the pill should render and whether shush is
// currently active. The pill itself is the control: one tap calls
// setManualShushToday() (persisted in userPreferencesStore), which flips
// `active` true until the lift rule releases it.
//
// CALM-MOMENT RULE (documented choice):
//   The pill may only appear BETWEEN commutes: local time in
//     [max(morning-commute-window end, alertWindowStart),
//      min(evening-commute-window start, alertWindowEnd))
//   With defaults (alerts 06:00-22:00, commute windows 07:00-10:00 /
//   16:30-19:30) that is 10:00-16:30 local.
//   Rationale: the intent pill owns the morning slot and the boarding nudge
//   owns the evening slot — the shush pill never competes with them, never
//   fires overnight, and never fires outside the user's alert hours. If the
//   window collapses (calmStart >= calmEnd) the pill never shows.
//   Additional gates: at most once per local calendar day
//   (shushPillLastShownDay, same dayKeyFor scheme as the intent pill), and
//   NEVER while a session is active (read-only SessionManager check).
//
// CONTRACT FOR THE PILL RENDERER: when it actually displays the pill it must
// call recordShushPillShown() once, otherwise the once-per-day gate has no
// memory.

import { useUserPreferencesStore, parseHHMM } from '../store/userPreferencesStore';
import { dayKeyFor, MORNING_WINDOW, EVENING_WINDOW } from './intentPillPolicy';
import { SessionManager } from '../services/SessionManager';

export interface ShushPillState {
  show: boolean;
  active: boolean;
}

/** True during the midday calm window defined above. Pure. */
function isCalmMoment(now: Date, alertWindowStart: string, alertWindowEnd: string): boolean {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const windowStartMin = parseHHMM(alertWindowStart) ?? 0;
  const windowEndMin = parseHHMM(alertWindowEnd) ?? 24 * 60;
  const calmStart = Math.max(MORNING_WINDOW.endMin, windowStartMin);
  const calmEnd = Math.min(EVENING_WINDOW.startMin, windowEndMin);
  if (calmStart >= calmEnd) return false;
  return nowMin >= calmStart && nowMin < calmEnd;
}

export function getShushPillState(): ShushPillState {
  const state = useUserPreferencesStore.getState();
  const active = state.isShushActiveForToday();
  if (active) return { show: false, active: true };
  // Never interrupt a live session.
  if (SessionManager.getSessionState() !== 'idle') return { show: false, active: false };
  const now = new Date();
  if (!isCalmMoment(now, state.alertWindowStart, state.alertWindowEnd)) {
    return { show: false, active: false };
  }
  // At most once per local day.
  if (state.shushPillLastShownDay === dayKeyFor(now)) return { show: false, active: false };
  return { show: true, active: false };
}
