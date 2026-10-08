// store/pillStore.ts
// Transient UI state for the Dynamic Island-style pill system (gooey shell).
// NOT persisted: pill state lives only for the current app session.
// Priority queue:
//   disruption (5) > boarding (4) > primer (3) > shush (2) > setup (1) > intent (0).
// A higher or equal priority request preempts the active pill; a lower one
// is dropped. Intent is 0 — strictly lowest, so it can NEVER preempt any
// other pill and is dropped whenever anything else is active. It is ambient
// context, not an alert; the queue semantics guarantee that ordering.
// 'setup' (1) is the lowest setup layer: inferred setup confirmations surface
// only when nothing more urgent is showing. 'shush' (2) sits above setup but
// below boarding — a manual-shush prompt never steals a boarding nudge.
//
// ZERO-NAG & ABSOLUTE SILENCE INVARIANT:
// Status updates / Good Service recovery NEVER trigger a Morph Pill.
// The Morph Pill is strictly restricted to urgent disruption, live travel context,
// and permission primer prompts.
//
// The queue is a LEASE, not a latch: PillBridge frees the slot (clearPill)
// when the visual pill dies (tap / swipe / auto-timeout), so a shown-once
// pill can never starve lower-priority pills for the whole session.
import { create } from 'zustand';
import { usePillSuppressionStore } from './pillSuppressionStore';

import type { NotificationTier } from '../components/DynamicIslandBanner/interfaces/dynamic-notification.interface';

export type PillKind =
  | 'disruption'
  | 'boarding'
  | 'primer'
  | 'shush'
  | 'setup'
  | 'intent';

export interface PillRequest {
  kind: PillKind;
  id: string; // unique per pill event
  title: string;
  message: string;
  accent: string; // hex color string, e.g. '#E32017'
  stationCode?: string; // e.g. 'OXC', 'VIC', 'KXX' for boarding badges
  shortLine?: string; // e.g. 'VIC', 'NOR', 'JUB'
  tier?: NotificationTier; // 'compact' (70) | 'standard' (84) | 'expanded' (96)
  actionLabel?: string; // e.g. 'Tap to Reroute' | 'Turn On'
  onAction?: () => void; // Explicit action callback
  beamAccent?: string;
  onPress?: () => void;
  onDismiss?: () => void;
  durationMs?: number | null;
}

export const PRIORITY: Record<PillKind, number> = {
  disruption: 5,
  boarding: 4,
  primer: 3,
  shush: 2,
  setup: 1,
  intent: 0,
};

export type MorphPillReason = 'location' | 'notifications';

interface PillState {
  active: PillRequest | null;
  /**
   * Last primer shown per permission key — drives the primer rotation rule
   * (when both location and notifications are denied, alternate which primer
   * shows; never both within the same hour). Session-scoped; the store is
   * not persisted.
   */
  primerLastShown: { key: string; at: number } | null;
  recordPrimerShown: (key: string) => void;
  requestPill: (req: PillRequest) => void;
  clearPill: () => void;
}

export const usePillStore = create<PillState>()((set, get) => ({
  active: null,
  primerLastShown: null,
  recordPrimerShown: (key) => set({ primerLastShown: { key, at: Date.now() } }),
  requestPill: (req) => {
    if (usePillSuppressionStore.getState().isSuppressed) return;
    const { active } = get();
    if (active && req.id === active.id) return; // already showing this event
    if (!active || PRIORITY[req.kind] >= PRIORITY[active.kind]) {
      set({ active: req }); // preemption: equal or higher priority wins
    }
    // lower priority while a pill is active: dropped
  },
  clearPill: () => set({ active: null }),
}));

export const useActivePill = () => usePillStore((s) => s.active);

/**
 * Enforceable Morph Pill API: strictly restricted to permission primers.
 * Passing a status update or any other arbitrary reason is a compile-time error.
 */
export function showMorphPill(
  reason: MorphPillReason,
  callbacks?: { onAction?: () => void; onPress?: () => void; onDismiss?: () => void }
): void {
  const isLocation = reason === 'location';
  const id = `primer-${isLocation ? 'locationAlways' : 'notifications'}`;
  usePillStore.getState().requestPill({
    kind: 'primer',
    id,
    title: isLocation ? 'Live commute tracking' : 'Disruption alerts',
    message: isLocation
      ? 'Auto-track your train on Lock Screen at the station'
      : 'Get notified before delays hit your commute',
    accent: '#0A84FF',
    tier: 'standard',
    shortLine: 'ALERTS',
    actionLabel: 'Enable',
    durationMs: 5000,
    onAction: callbacks?.onAction,
    onPress: callbacks?.onPress,
    onDismiss: callbacks?.onDismiss,
  });
}
