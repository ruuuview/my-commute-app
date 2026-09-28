// hooks/useSetupConfirmPill.ts
// Setup-confirmation pill: the inference engine (utils/commuteInference)
// proposes one-tap confirmations ("Set Camden Town as Home?"); this hook is
// the thin VIEW over that brain — it surfaces the first pending confirmation
// as a 'setup' pill (priority 1, the lowest setup layer; the nudge's own
// copy carries the payoff, per the inference-first plan).
//
// Interaction contract:
// - Tap = 1-tap commit: confirmConfirmation(c), then immediately swap to a
//   transient "Saved" pill (~5 s, kind 'setup') whose tap =
//   undoLastConfirmation().
// - Dismiss (swipe / visual auto-timeout) = dismissConfirmation(c). The
//   lease timer in PillBridge fires PillRequest.onDismiss before clearing the
//   slot, so a swiped or timed-out nudge counts as dismissed, never as
//   committed.
//
// The inference module is a sibling workstream; this hook uses the same
// guarded-require pattern as services/backgroundTask.ts so a missing module
// is a silent no-op, never a crash.

import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { usePillStore } from '../store/pillStore';
import { useUserPreferencesStore } from '../store/userPreferencesStore';

/** Verbatim contract for utils/commuteInference.PendingConfirmation. */
type PendingConfirmation =
  | { type: 'home' | 'work'; stationId: string; stationName: string; reconfirm?: boolean }
  | { type: 'hours'; windowStart: string; windowEnd: string };

function confirmationId(c: PendingConfirmation): string {
  return c.type === 'hours'
    ? `hours-${c.windowStart}-${c.windowEnd}`
    : `${c.type}-${c.stationId}${c.reconfirm ? '-reconfirm' : ''}`;
}

function confirmationTitle(c: PendingConfirmation): string {
  if (c.type === 'hours') return `Commute ${c.windowStart}\u2013${c.windowEnd}?`;
  const role = c.type === 'home' ? 'Home' : 'Work';
  return c.reconfirm ? `Still your ${role} station?` : `Set ${c.stationName} as ${role}?`;
}

/** Copy carries the payoff: why the tap is worth it. Zero emoji. */
function confirmationMessage(c: PendingConfirmation): string {
  if (c.type === 'hours') return "Tap once \u2014 we'll only ping you about delays then";
  return "One tap \u2014 we'll use it for boarding nudges and commute alerts";
}

interface CommuteInferenceModule {
  getPendingConfirmations?: () => PendingConfirmation[];
  confirmConfirmation?: (c: PendingConfirmation) => void;
  dismissConfirmation?: (c: PendingConfirmation) => void;
  undoLastConfirmation?: () => void;
}

function loadInference(): CommuteInferenceModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../utils/commuteInference') as CommuteInferenceModule;
    if (mod && typeof mod.getPendingConfirmations === 'function') return mod;
    return null;
  } catch {
    // Sibling module not landed yet — silent no-op.
    return null;
  }
}

/** Transient undo pill shown right after a 1-tap commit. */
function requestUndoPill(): void {
  usePillStore.getState().requestPill({
    kind: 'setup',
    id: `setup-undo-${Date.now()}`,
    title: 'Saved',
    message: 'Tap to undo',
    accent: '#30D158',
    durationMs: 5000,
    onPress: () => {
      loadInference()?.undoLastConfirmation?.();
    },
  });
}

function evaluate(): void {
  const inference = loadInference();
  if (!inference) return;
  const store = usePillStore.getState();
  const pending = inference.getPendingConfirmations?.() ?? [];
  const first = pending[0] ?? null;

  if (!first) {
    // Nothing pending: retire a stale setup-CONFIRM pill. The transient
    // undo pill (id setup-undo-*) is left alone to live out its 5 s.
    const active = store.active;
    if (active?.kind === 'setup' && active.id.startsWith('setup-confirm-')) {
      store.clearPill();
    }
    return;
  }

  store.requestPill({
    kind: 'setup',
    id: `setup-confirm-${confirmationId(first)}`,
    title: confirmationTitle(first),
    message: confirmationMessage(first),
    accent: '#30D158',
    onPress: () => {
      // 1-tap commit, then immediately offer undo. The undo pill replaces
      // this one (same kind, equal priority preempts), so PillBridge's tap
      // wrapper leaves the fresh pill alone.
      inference.confirmConfirmation?.(first);
      requestUndoPill();
    },
    onDismiss: () => {
      // Swipe / visual auto-timeout: the user saw the nudge and let it die —
      // record the dismissal so inference can back off.
      inference.dismissConfirmation?.(first);
    },
  });
}

/**
 * Drives the setup-confirmation pill. Mount once (PillBridge). Re-evaluates
 * on mount, on every foreground tick, and on user-preference changes;
 * evaluate() is idempotent and requestPill dedupes on the stable
 * `setup-confirm-<id>`.
 */
export function useSetupConfirmPill(): void {
  useEffect(() => {
    evaluate();
    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') evaluate();
    };
    const sub = AppState.addEventListener('change', onAppState);
    const unsubscribePrefs = useUserPreferencesStore.subscribe(() =>
      evaluate(),
    );
    return () => {
      sub.remove();
      unsubscribePrefs();
    };
  }, []);
}
