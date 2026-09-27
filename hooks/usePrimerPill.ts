// hooks/usePrimerPill.ts
// Worker C — Phase 2 pill integration: the auto-track permission primer pill.
//
// Wires the transient pill system (store/pillStore) to the permission state
// machine (store/permissionOrchestrator). Shows one ambient "Enable Auto-Track"
// pill while a wanted permission is still missing, and clears a stale primer
// pill once everything wanted is granted.
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

import { useEffect } from 'react';
import { usePillStore } from '../store/pillStore';
import {
  getPermissionEntry,
  getPrimerRequest,
  requestPermission,
  subscribePrimer,
  usePermissionOrchestrator,
  type PermissionKey,
} from '../store/permissionOrchestrator';

/**
 * Wanted permissions, in priority order. 'location' from the pill plan maps to
 * 'locationAlways': this pill promotes Auto-Track ("background station
 * alerts"), which needs background location, and the orchestrator's Always
 * flow already performs the 2-step progressive authorization (foreground
 * first) when foreground was never granted.
 */
const WANTED_KEYS: PermissionKey[] = ['locationAlways', 'notifications'];

/** Analytics trigger recorded with permission_requested / permission_granted. */
const PILL_TRIGGER = 'primer_pill';

/**
 * First wanted permission that is definitively not granted.
 * PermissionDecision = 'granted' | 'denied' | 'not_asked' | 'deferred' — the
 * enum has no unknown/error member, so anything other than 'granted' counts
 * as missing.
 */
function firstMissingKey(): PermissionKey | null {
  for (const key of WANTED_KEYS) {
    if (getPermissionEntry(key).decision !== 'granted') {
      return key;
    }
  }
  return null;
}

function evaluate(): void {
  const pillStore = usePillStore.getState();
  const missing = firstMissingKey();

  if (missing && getPrimerRequest() === null) {
    const key = missing; // narrow for the onPress closure
    pillStore.requestPill({
      kind: 'primer',
      id: `primer-${key}`,
      title: 'Enable Auto-Track',
      message: 'Tap to activate background station alerts',
      accent: '#0A84FF',
      onPress: () => {
        // Defensive: a primer may have appeared between the pill request and
        // the tap (another flow). The orchestrator's in-flight guard would
        // no-op the request anyway; skip early to avoid a redundant call.
        if (getPrimerRequest() !== null) return;
        void requestPermission(key, PILL_TRIGGER);
      },
    });
    return;
  }

  // Nothing missing: retire a stale primer pill so it disappears once granted.
  // Other pill kinds (disruption/boarding) are never cleared here.
  if (!missing && pillStore.active?.kind === 'primer') {
    pillStore.clearPill();
  }
}

/**
 * Drives the auto-track primer pill. Mount once (the Phase 2 bridge mounts
 * this). Re-evaluates on mount, on every permission-state change (zustand
 * subscription on the orchestrator store) and whenever the primer request
 * changes. No intervals, no re-render-driven re-checks; evaluate() is
 * idempotent and requestPill dedupes on the stable id.
 */
export function usePrimerPill(): void {
  useEffect(() => {
    evaluate();
    const unsubscribeStatus = usePermissionOrchestrator.subscribe(evaluate);
    const unsubscribePrimer = subscribePrimer(() => evaluate());
    return () => {
      unsubscribeStatus();
      unsubscribePrimer();
    };
  }, []);
}
