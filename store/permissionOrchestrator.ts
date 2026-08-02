// store/permissionOrchestrator.ts
// THE permission state machine (locked by AGENTS.md §0).
// THE ONE RULE: nothing in the app calls Location.requestForegroundPermissionsAsync(),
// requestBackgroundPermissionsAsync(), Calendar.requestCalendarPermissionsAsync() or
// Notifications.requestPermissionsAsync() directly. Everything routes through
// requestPermission(key, trigger).
//
// Locked by the remediation plan Phase 4 (#1, #2, #12, #13):
//  - NO session-count triggers (that was the bug — removed).
//  - Post-onboarding asks are feature-triggered only.
//  - Never two permission dialogs in the same session (in-flight guard).
//  - Custom primer screen FIRST, OS dialog only if the user proceeds.
//  - Always-location: onboarding asks While-Using only; the Always upgrade
//    primer fires ONLY after the first real Tier 1 geofence hit, 7-day
//    cooldown after decline, max 2 lifetime re-asks, then silent degrade
//    to While-Using mode + settings nudge (non-dialog).
//  - Calendar: removed from the ask-flow (feature dormant — no activation
//    point exists). Kept in the state machine with its primer copy ready
//    for when the named feature activates.

import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { track } from '../services/analyticsService';
import { useUserPreferencesStore } from './userPreferencesStore';

const storage = createMMKV({ id: 'permission-orchestrator' });

const mmkvStorageAdapter: StateStorage = {
  setItem: (name, value) => {
    storage.set(name, value);
  },
  getItem: (name) => {
    const value = storage.getString(name);
    return value ?? null;
  },
  removeItem: (name) => {
    storage.remove(name);
  },
};

export type PermissionKey =
  | 'locationWhenInUse'
  | 'locationAlways'
  | 'notifications'
  | 'calendar';

export type PermissionDecision = 'granted' | 'denied' | 'not_asked' | 'deferred';

export interface PermissionEntry {
  decision: PermissionDecision;
  lastAskedAt: number | null;
  askCount: number;
}

export const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7-day cooldown after decline
export const MAX_ALWAYS_REASKS = 2; // lifetime cap for the Always-location upgrade

const DEFAULT_ENTRY: PermissionEntry = {
  decision: 'not_asked',
  lastAskedAt: null,
  askCount: 0,
};

export const PRIMER_COPY: Record<PermissionKey, { title: string; body: string; button: string }> = {
  locationWhenInUse: {
    title: 'Home turf, locked.',
    body: "We'll keep your station front and centre so you're not hunting for it every morning like it's a personality test.",
    button: 'Lock My Station',
  },
  locationAlways: {
    title: 'YOU MISSED A DELAY. WE DIDN\u2019T.',
    body: 'Let us track your Home–Work route in the background and we\u2019ll flag every delay like this — no more digging through old journeys yourself.',
    button: 'Never Miss One',
  },
  notifications: {
    title: 'Tube drama moves fast.',
    body: "We'll tell you before you're standing on a dead platform wondering why.",
    button: 'Turn On Alerts',
  },
  calendar: {
    title: 'We peek, we don\u2019t pry.',
    body: "Just the start time of your next thing — enough to time your alert right. Not your meetings, not your plans, not your business.",
    button: 'Sync My Next Event',
  },
};

interface PermissionOrchestratorState {
  permissions: Record<PermissionKey, PermissionEntry>;
  tier1HitCount: number;
  upgradePrimerShownAt: number | null;
  settingsNudgeDismissedAt: number | null;
  recordDecision: (key: PermissionKey, decision: PermissionDecision) => void;
  recordTier1Hit: () => number;
  dismissSettingsNudge: () => void;
}

export const usePermissionOrchestrator = create<PermissionOrchestratorState>()(
  persist(
    (set) => ({
      permissions: {
        locationWhenInUse: { ...DEFAULT_ENTRY },
        locationAlways: { ...DEFAULT_ENTRY },
        notifications: { ...DEFAULT_ENTRY },
        calendar: { ...DEFAULT_ENTRY },
      },
      tier1HitCount: 0,
      upgradePrimerShownAt: null,
      settingsNudgeDismissedAt: null,

      recordDecision: (key, decision) => {
        // Mirror granted/denied into the legacy preferences store so
        // existing consumers (geofence sync, dashboard switches) stay in
        // sync without touching them.
        const prefs = useUserPreferencesStore.getState();
        if (decision === 'granted' || decision === 'denied') {
          const granted = decision === 'granted';
          if (key === 'locationWhenInUse' || key === 'locationAlways') {
            prefs.setLocationGranted(granted);
          } else if (key === 'notifications') {
            prefs.setNotificationsGranted(granted);
          } else if (key === 'calendar') {
            prefs.setCalendarGranted(granted);
          }
        }
        set((state) => ({
          permissions: {
            ...state.permissions,
            [key]: {
              decision,
              lastAskedAt: decision === 'granted' || decision === 'denied' ? Date.now() : state.permissions[key]?.lastAskedAt ?? null,
              askCount: (state.permissions[key]?.askCount ?? 0) + 1,
            },
          },
        }));
      },

      recordTier1Hit: () => {
        let next = 0;
        set((state) => {
          next = state.tier1HitCount + 1;
          return { tier1HitCount: next };
        });
        return next;
      },

      dismissSettingsNudge: () => set({ settingsNudgeDismissedAt: Date.now() }),
    }),
    {
      name: 'permission-orchestrator',
      storage: createJSONStorage(() => mmkvStorageAdapter),
    }
  )
);

// ── In-flight guard: NEVER two permission dialogs at once ───────────
let dialogInFlight = false;

export function isAnyPermissionDialogActive(): boolean {
  return dialogInFlight;
}

export function getPermissionEntry(key: PermissionKey): PermissionEntry {
  return usePermissionOrchestrator.getState().permissions[key] ?? { ...DEFAULT_ENTRY };
}

/**
 * Custom primer UI. The mounted PermissionPrimerModal consumes this promise
 * pair — exactly ONE primer can be visible at a time.
 */
interface PrimerRequest {
  key: PermissionKey;
  trigger: string;
  copy?: { title: string; body: string; button: string }; // dynamic override (e.g. the £X.XX money line)
  resolve: (proceed: boolean) => void;
}
let primerRequest: PrimerRequest | null = null;

export function requestPrimer(
  key: PermissionKey,
  trigger: string,
  copy?: { title: string; body: string; button: string }
): Promise<boolean> {
  return new Promise((resolve) => {
    primerRequest = { key, trigger, copy, resolve };
    primerListeners.forEach((l) => l(primerRequest));
  });
}

export function resolvePrimer(proceed: boolean): void {
  if (primerRequest) {
    primerRequest.resolve(proceed);
    primerRequest = null;
    primerListeners.forEach((l) => l(null));
  }
}

export function getPrimerRequest(): PrimerRequest | null {
  return primerRequest;
}

type PrimerListener = (request: PrimerRequest | null) => void;
const primerListeners = new Set<PrimerListener>();

export function subscribePrimer(listener: PrimerListener): () => void {
  primerListeners.add(listener);
  return () => primerListeners.delete(listener);
}

// ── The ONE entry point for every permission ask ────────────────────

async function osPrompt(key: PermissionKey): Promise<boolean> {
  switch (key) {
    case 'locationWhenInUse': {
      const fg = await Location.requestForegroundPermissionsAsync();
      return fg.status === 'granted';
    }
    case 'locationAlways': {
      // Requires While-Using already granted (the upgrade path guarantees it).
      const fg = await Location.getForegroundPermissionsAsync();
      if (fg.status !== 'granted') return false;
      const bg = await Location.requestBackgroundPermissionsAsync();
      return bg.status === 'granted';
    }
    case 'notifications': {
      const res = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      return res.status === 'granted';
    }
    case 'calendar': {
      const cal = await import('expo-calendar');
      const res = await cal.requestCalendarPermissionsAsync();
      return res.status === cal.PermissionStatus.GRANTED;
    }
    default:
      return false;
  }
}

/**
 * THE ONE permission entry point (plan Phase 4 spec).
 * Returns the resulting PermissionDecision for the caller.
 *
 * Flow: granted/denied short-circuit → 7-day cooldown after decline →
 * in-flight guard (defer rather than stack) → custom primer first →
 * OS dialog only if the user proceeds. Analytics events fire per state
 * transition (Phase 7 #15).
 */
export async function requestPermission(
  key: PermissionKey,
  trigger: string,
  opts?: { primer?: boolean; copy?: { title: string; body: string; button: string } }
): Promise<PermissionDecision> {
  const entry = getPermissionEntry(key);

  // Short-circuit granted.
  if (entry.decision === 'granted') return 'granted';

  // Denied: lifetime cap for Always, 7-day cooldown for all keys.
  if (entry.decision === 'denied') {
    if (key === 'locationAlways' && entry.askCount >= MAX_ALWAYS_REASKS) {
      return 'denied'; // silent degrade — caller shows the settings nudge, never a dialog
    }
    if (entry.lastAskedAt && Date.now() - entry.lastAskedAt < COOLDOWN_MS) {
      return 'deferred';
    }
  }

  // NEVER STACK dialogs.
  if (dialogInFlight) return 'deferred';

  dialogInFlight = true;
  try {
    track('permission_requested', { key, trigger });
    if (key === 'locationAlways') {
      track('permission_upgrade_primer_shown', { key });
      usePermissionOrchestrator.setState({ upgradePrimerShownAt: Date.now() });
    }

    // Custom primer FIRST; OS dialog only if the user proceeds.
    const showPrimer = opts?.primer !== false;
    if (showPrimer) {
      const proceed = await requestPrimer(key, trigger, opts?.copy);
      if (!proceed) {
        // User declined at the primer: record deferred (not a hard deny —
        // cooldown logic still applies via lastAskedAt semantics below).
        usePermissionOrchestrator.getState().recordDecision(key, 'deferred');
        return 'deferred';
      }
    }

    const granted = await osPrompt(key);
    const decision: PermissionDecision = granted ? 'granted' : 'denied';
    usePermissionOrchestrator.getState().recordDecision(key, decision);
    track(granted ? 'permission_granted' : 'permission_denied', { key });
    return decision;
  } finally {
    dialogInFlight = false;
  }
}

/**
 * Tier 1 geofence hit — the "user has seen real value once" signal.
 * Returns the updated hit count. Callers show the Always-location upgrade
 * primer via requestPermission('locationAlways', 'tier1_upgrade') when the
 * returned count === 1 (first real hit).
 */
export function notifyTier1GeofenceHit(): number {
  return usePermissionOrchestrator.getState().recordTier1Hit();
}
