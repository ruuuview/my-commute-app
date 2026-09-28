// components/DynamicIslandBanner/PillBridge.tsx
// Bridges the transient pill store (store/pillStore.ts) to the vendored
// Dynamic Island (gooey) shell. Must be rendered INSIDE <DynamicNotifications>.
//
// The edge-trigger hooks (disruption / boarding nudge / permission primer /
// commute intent / setup confirm / shush) are self-driving: they observe
// their own data sources and call usePillStore.getState().requestPill(...)
// when they fire. This component only mirrors the store's active pill into
// the gooey shell via trigger().
//
// LEASE, not latch: the store slot is freed when the visual pill dies —
// tap, swipe, or the auto-timeout (durationMs, default 4000 ms). Without
// this, a primer shown once at launch would starve the intent pill for the
// whole session. A tap runs the pill's onPress first; the slot is cleared
// afterwards unless the tap's own handler already replaced the pill (e.g.
// setup-confirm → the transient "Saved · Undo" pill).

import React, { useEffect } from 'react';
import { useDynamicNotifications } from './hooks';
import { usePillStore } from '../../store/pillStore';
import { useDisruptionEdgeTrigger } from '../../hooks/useDisruptionEdgeTrigger';
import { useBoardingNudge } from '../../hooks/useBoardingNudge';
import { usePrimerPill } from '../../hooks/usePrimerPill';
import { useIntentPill } from '../../hooks/useIntentPill';
import { useSetupConfirmPill } from '../../hooks/useSetupConfirmPill';
import { useShushPill } from '../../hooks/useShushPill';
import { PillContent } from './PillContent';

const DEFAULT_PILL_DURATION_MS = 4000;

export function PillBridge(): React.JSX.Element | null {
  const { trigger, dismiss } = useDynamicNotifications();
  const active = usePillStore((s) => s.active);

  // Self-driving triggers, mounted unconditionally at top level.
  useDisruptionEdgeTrigger();
  useBoardingNudge();
  usePrimerPill();
  useIntentPill();
  useSetupConfirmPill();
  useShushPill();

  useEffect(() => {
    if (!active) {
      dismiss();
      return;
    }
    const pillId = active.id;
    const durationMs = active.durationMs ?? DEFAULT_PILL_DURATION_MS;
    dismiss();
    trigger({
      id: active.id,
      title: active.title,
      message: active.message,
      accent: active.accent,
      duration: durationMs,
      onPress: () => {
        const before = usePillStore.getState().active;
        try {
          active.onPress?.();
        } finally {
          // The shell visually dismisses on tap. Free the store slot unless
          // the tap's handler already swapped in a replacement pill.
          const s = usePillStore.getState();
          if (s.active?.id === before?.id) s.clearPill();
        }
      },
      render: () => (
        <PillContent
          title={active.title}
          message={active.message}
          accent={active.accent}
        />
      ),
    });
    // Lease timer, matched to the visual lifetime: when the visual pill
    // auto-dies, the store slot dies with it. Non-tap dismissals (swipe /
    // timeout) also fire onDismiss first, so e.g. a swiped setup-confirm
    // counts as dismissed. Guarded by pill id — a preempting pill is never
    // cleared by a stale timer.
    const timer = setTimeout(() => {
      const s = usePillStore.getState();
      if (s.active?.id === pillId) {
        try {
          s.active?.onDismiss?.();
        } finally {
          s.clearPill();
        }
      }
    }, durationMs);
    return () => clearTimeout(timer);
  }, [active, dismiss, trigger]);

  return null;
}
