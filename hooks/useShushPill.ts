// hooks/useShushPill.ts
// Shush pill: thin VIEW over the shush policy brain (utils/shushPillPolicy).
//
// - getShushPillState() -> { show, active }:
//   - show && !active → "Working from home today? Tap to shush"
//     (tap = setManualShushToday()).
//   - active → "Shush mode on · Tap to turn off" (tap = clearManualShush()).
//   - !show → retire a stale shush pill.
// - Never requests permissions; tap only flips the manual-shush store flag.
//
// Widget → app sync: the widget's shush toggle writes `manualShushDate`
// (Double unix timestamp, nil = unshushed) to the App Group
// group.com.mycommute.app via MyCommuteLiveActivityModule. On mount and on
// every foreground tick this hook reads that key and reconciles the store,
// last-writer-wins:
//   - key holds a timestamp whose day is today, store not shushed today →
//     setManualShushToday().
//   - key absent, store HAS a manual shush for today → clearManualShush()
//     (the widget was unshushed).
// Everything is guarded: a missing native module/method, a missing store
// action, or any thrown error is a silent no-op, never a crash. (The
// coordinator separately wires the store actions to write through to the
// same key.)

import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { usePillStore } from '../store/pillStore';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { getManualShushBridge } from '../utils/shushNativeBridge';

interface ShushPillPolicyState {
  show: boolean;
  active: boolean;
}

interface ShushPillPolicyModule {
  getShushPillState?: () => ShushPillPolicyState;
}

function loadPolicy(): ShushPillPolicyModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../utils/shushPillPolicy') as ShushPillPolicyModule;
    if (mod && typeof mod.getShushPillState === 'function') return mod;
    return null;
  } catch {
    // Sibling module not landed yet — silent no-op.
    return null;
  }
}

// The manual-shush store actions are being added by the coordinator alongside
// the native write-through; read them defensively so this hook never crashes
// if they haven't landed yet.
interface ManualShushActions {
  setManualShushToday?: () => void;
  clearManualShush?: () => void;
  /** Records that the shush-suggest pill was actually displayed (once/day gate). */
  recordShushPillShown?: () => void;
  /** Persisted marker for a manual shush (day the user shushed). */
  manualShushDate?: string | number | null;
}

function shushActions(): ManualShushActions {
  return useUserPreferencesStore.getState() as unknown as ManualShushActions;
}

function timestampIsToday(ts: number): boolean {
  // Double unix timestamp: seconds or milliseconds — accept both.
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const d = new Date(ms);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function storeShushedToday(): boolean {
  const { manualShushDate } = shushActions();
  if (manualShushDate == null) return false;
  if (typeof manualShushDate === 'number') return timestampIsToday(manualShushDate);
  if (typeof manualShushDate === 'string') {
    // Day key YYYY-MM-DD.
    const now = new Date();
    const key =
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-` +
      `${String(now.getDate()).padStart(2, '0')}`;
    return manualShushDate === key;
  }
  return false;
}

/**
 * Widget → app reconciliation. Reads the App Group key through the native
 * bridge and reconciles the store, last-writer-wins:
 *   - key holds a timestamp whose day is today, store not shushed today →
 *     setManualShushToday().
 *   - key absent, store HAS a manual shush for today → clearManualShush()
 *     (the widget was unshushed).
 * Guarded end to end: missing bridge or any error → silent no-op.
 */
async function syncWidgetShush(): Promise<void> {
  try {
    const bridge = getManualShushBridge();
    if (!bridge) return;
    const ts = await bridge.getManualShushDate();
    const keyAbsent = ts == null || ts === 0;
    const widgetShushedToday =
      !keyAbsent && timestampIsToday(ts as number);
    const appShushedToday = storeShushedToday();
    const actions = shushActions();

    if (widgetShushedToday && !appShushedToday) {
      if (typeof actions.setManualShushToday === 'function') {
        actions.setManualShushToday();
      } else {
        console.warn(
          '[useShushPill] setManualShushToday not on store yet; widget shush not applied',
        );
      }
    } else if (keyAbsent && appShushedToday) {
      if (typeof actions.clearManualShush === 'function') {
        actions.clearManualShush();
      } else {
        console.warn(
          '[useShushPill] clearManualShush not on store yet; widget unshush not applied',
        );
      }
    }
  } catch {
    // Native bridge hiccup — silent.
  }
}

function evaluate(): void {
  const policy = loadPolicy();
  if (!policy) return;
  const state = policy.getShushPillState?.();
  if (!state) return;
  const store = usePillStore.getState();
  const actions = shushActions();

  if (state.show && !state.active) {
    // Record the display once per transition so the policy's once-per-day
    // gate has restart-surviving memory (requestPill dedupes repeats).
    const alreadyShowing = store.active?.id === 'shush-suggest';
    store.requestPill({
      kind: 'shush',
      id: 'shush-suggest',
      title: 'Working from home today?',
      message: "Tap to mute today's alerts",
      accent: '#8E8E93',
      onPress: () => {
        if (typeof actions.setManualShushToday === 'function') {
          actions.setManualShushToday();
        } else {
          console.warn(
            '[useShushPill] setManualShushToday not on store yet; tap ignored',
          );
        }
      },
    });
    if (!alreadyShowing && typeof actions.recordShushPillShown === 'function') {
      actions.recordShushPillShown();
    }
    return;
  }

  if (state.active) {
    store.requestPill({
      kind: 'shush',
      id: 'shush-active',
      title: 'Shush mode on',
      message: 'Tap to turn off',
      accent: '#8E8E93',
      onPress: () => {
        if (typeof actions.clearManualShush === 'function') {
          actions.clearManualShush();
        } else {
          console.warn(
            '[useShushPill] clearManualShush not on store yet; tap ignored',
          );
        }
      },
    });
    return;
  }

  // Policy says hide: retire a stale shush pill. Other kinds untouched.
  if (store.active?.kind === 'shush') {
    store.clearPill();
  }
}

/**
 * Drives the shush pill. Mount once (PillBridge). Re-evaluates on mount, on
 * every foreground tick (pill state + widget sync), and on user-preference
 * changes; evaluate() is idempotent and requestPill dedupes on the stable
 * `shush-suggest` / `shush-active` ids.
 */
export function useShushPill(): void {
  useEffect(() => {
    evaluate();
    void syncWidgetShush();
    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') {
        evaluate();
        void syncWidgetShush();
      }
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
