// hooks/usePrimerPill.ts
// Worker C — Phase 2 pill integration: the auto-track permission primer pill.
//
// Wires the transient pill system (store/pillStore) to the permission state
// machine (store/permissionOrchestrator). Shows one ambient primer pill while
// a wanted permission is still missing, and clears a stale primer pill once
// everything wanted is granted.
//
// Rules honored:
//  - Never triggers an OS permission prompt directly. The pill's onPress
//    routes through requestPermission(), the orchestrator's single entry
//    point: custom primer modal first, OS dialog only if the user presses
//    Continue, with the in-flight guard, 7-day cooldown and Always re-ask cap
//    enforced inside.
//  - Never nag-stacks with the PermissionPrimerModal: the pill is requested
//    only while getPrimerRequest() === null.
//  - Read-only status checks only: getPermissionEntry(key).decision.
//  - Stable pill id (`primer-<key>`) so requestPill dedupes — no nag loop.
//  - Rotation: when BOTH location and notifications are missing, the primers
//    alternate — never both within the same hour. Last-shown is tracked in
//    the pill store (session-scoped) and only recorded when the request
//    actually lands (a request dropped because a higher-priority pill is
//    active does not count as shown).

import { useEffect } from 'react';
import { usePillStore } from '../store/pillStore';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import {
  getPermissionEntry,
  getPrimerRequest,
  requestPermission,
  subscribePrimer,
  usePermissionOrchestrator,
} from '../store/permissionOrchestrator';

/**
 * Wanted permissions, in priority order. 'location' from the pill plan maps to
 * 'locationAlways': this pill promotes the boarding nudge ("background
 * station alerts"), which needs background location, and the orchestrator's
 * Always flow already performs the 2-step progressive authorization
 * (foreground first) when foreground was never granted.
 */
type PrimerKey = 'locationAlways' | 'notifications';
const WANTED_KEYS: PrimerKey[] = ['notifications', 'locationAlways'];

/** Analytics trigger recorded with permission_requested / permission_granted. */
const PILL_TRIGGER = 'primer_pill';

/** Minimum gap between the two primers when both permissions are missing. */
const ROTATION_COOLDOWN_MS = 60 * 60 * 1000;

/** Payoff-carrying copy, zero jargon, zero emoji — one entry per primer. */
const PRIMER_COPY: Record<PrimerKey, { title: string; message: string; actionLabel: string }> = {
  notifications: {
    title: 'Get live disruption warnings',
    message: 'Tap to enable notifications before you travel',
    actionLabel: 'Enable',
  },
  locationAlways: {
    title: 'Get a nudge before your train leaves',
    message: 'Tap once — we\u2019ll ping you when your train is 2 minutes out',
    actionLabel: 'Enable',
  },
};

/**
 * Wanted permissions that are definitively not granted.
 * PermissionDecision = 'granted' | 'denied' | 'not_asked' | 'deferred' — the
 * enum has no unknown/error member, so anything other than 'granted' counts
 * as missing.
 */
function missingKeys(): PrimerKey[] {
  return WANTED_KEYS.filter(
    (key) => getPermissionEntry(key).decision !== 'granted',
  );
}

/**
 * Which primer to show for the current missing set, or null to stay quiet
 * this tick. Single missing key → that primer. Both missing → alternate,
 * never showing the two within the same hour.
 */
function pickPrimerKey(missing: PrimerKey[]): PrimerKey | null {
  if (missing.length === 0) return null;
  if (missing.length === 1) return missing[0];
  const last = usePillStore.getState().primerLastShown;
  if (last && Date.now() - last.at < ROTATION_COOLDOWN_MS) return null;
  // Alternate: show the one that wasn't shown last.
  return last?.key === missing[0] ? missing[1] : missing[0];
}

function evaluate(): void {
  const pillStore = usePillStore.getState();
  const userPrefs = useUserPreferencesStore.getState();

  // Enforce lifetime 2-ask limit
  if ((userPrefs.primerPillPresentationCount || 0) >= 2) {
    return;
  }

  const missing = missingKeys();

  const key = getPrimerRequest() === null ? pickPrimerKey(missing) : null;
  if (key) {
    const pillId = `primer-${key}`;
    const copy = PRIMER_COPY[key];
    pillStore.requestPill({
      kind: 'primer',
      tier: 'standard',
      id: pillId,
      shortLine: 'ALERTS',
      title: copy.title,
      message: copy.message,
      actionLabel: copy.actionLabel,
      accent: '#0A84FF',
      durationMs: 5000,
      onAction: () => {
        useUserPreferencesStore.getState().incrementPrimerPillPresentationCount();
        if (getPrimerRequest() !== null) return;
        void requestPermission(key, PILL_TRIGGER);
      },
      onPress: () => {
        useUserPreferencesStore.getState().incrementPrimerPillPresentationCount();
        if (getPrimerRequest() !== null) return;
        void requestPermission(key, PILL_TRIGGER);
      },
      onDismiss: () => {
        // Natural full display timeout (5s) without preemption consumes 1 ask
        useUserPreferencesStore.getState().incrementPrimerPillPresentationCount();
      },
    });
    // Record only if the request actually landed
    if (usePillStore.getState().active?.id === pillId) {
      pillStore.recordPrimerShown(key);
    }
    return;
  }

  // Nothing missing: retire a stale primer pill so it disappears once granted.
  if (missing.length === 0 && pillStore.active?.kind === 'primer') {
    pillStore.clearPill();
  }
}

/** Initial grace period on app launch before evaluating ambient primer pills. */
const APP_LAUNCH_GRACE_DELAY_MS = 20_000;

export function usePrimerPill(): void {
  useEffect(() => {
    // Let the app open and settle cleanly — 20 seconds dashboard presence
    const timer = setTimeout(() => {
      evaluate();
    }, APP_LAUNCH_GRACE_DELAY_MS);

    const unsubscribeStatus = usePermissionOrchestrator.subscribe(() => {
      evaluate();
    });
    const unsubscribePrimer = subscribePrimer(() => evaluate());

    return () => {
      clearTimeout(timer);
      unsubscribeStatus();
      unsubscribePrimer();
    };
  }, []);
}
