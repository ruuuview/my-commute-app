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
// ONBOARDING GATE: the triggers live in <PillTriggers/>, mounted only after
// hasCompletedOnboarding. Pills are ambient main-app UI and must never drop
// over the onboarding setup screens.
//
// LEASE, not latch: the store slot is freed when the visual pill dies —
// tap, swipe, or the auto-timeout (durationMs, default 4000 ms). Without
// this, a primer shown once at launch would starve the intent pill for the
// whole session. A tap runs the pill's onPress first; the slot is cleared
// afterwards unless the tap's own handler already replaced the pill (e.g.
// setup-confirm → the transient "Saved · Undo" pill).

import React, { useEffect } from 'react';
import { useSegments } from 'expo-router';
import { useDynamicNotifications } from './hooks';
import { usePillStore } from '../../store/pillStore';
import { useUserPreferencesStore } from '../../store/userPreferencesStore';
import { useDisruptionEdgeTrigger } from '../../hooks/useDisruptionEdgeTrigger';
import { useBoardingNudge } from '../../hooks/useBoardingNudge';
import { usePrimerPill } from '../../hooks/usePrimerPill';
import { useIntentPill } from '../../hooks/useIntentPill';
import { useSetupConfirmPill } from '../../hooks/useSetupConfirmPill';
import { useShushPill } from '../../hooks/useShushPill';
import { PillContent } from './PillContent';
import { usePillSuppression } from '../../hooks/usePillSuppression';
import { usePillSuppressionStore } from '../../store/pillSuppressionStore';

const DEFAULT_PILL_DURATION_MS = 4000;

export function PillBridge(): React.JSX.Element | null {
  const { trigger, dismiss } = useDynamicNotifications();
  const active = usePillStore((s) => s.active);
  const onboardingDone = useUserPreferencesStore((s) => s.hasCompletedOnboarding);
  const suppressed = usePillSuppressionStore((s) => s.isSuppressed);
  const segments = useSegments();
  const pathSegments = (segments as string[]) || [];
  
  // Dashboard routes: [] (root), ['(tabs)', 'index'], or ['index'].
  // Suppressed on settings, privacy, terms, refunds tab, station-detail, and onboarding.
  const isDashboardRoute =
    pathSegments.length === 0 ||
    (pathSegments.length === 1 && (pathSegments[0] === 'index' || pathSegments[0] === '(tabs)')) ||
    (pathSegments.length === 2 && pathSegments[0] === '(tabs)' && pathSegments[1] === 'index');

  usePillSuppression('onboarding', !onboardingDone);
  usePillSuppression('route', !isDashboardRoute);

  useEffect(() => {
    if (suppressed) {
      dismiss();
      if (active) usePillStore.getState().clearPill();
      return;
    }
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
  }, [active, dismiss, suppressed, trigger]);

  // The in-app pill is an ambient companion for the main app — it must never
  // fire during the focused onboarding flow, where it would drop over the
  // setup screens (e.g. the permission primer landing on top of the "Your
  // lines" header). The triggers mount only after onboarding completes, so
  // their mount-time evaluation runs exactly once, on the dashboard.
  return onboardingDone && !suppressed ? <PillTriggers /> : null;
}

/**
 * Self-driving pill triggers (disruption / boarding nudge / permission
 * primer / commute intent / setup confirm / shush). Split out so the
 * hooks stay unconditional — this component mounts only after onboarding.
 */
function PillTriggers(): null {
  useDisruptionEdgeTrigger();
  useBoardingNudge();
  usePrimerPill();
  useIntentPill();
  useSetupConfirmPill();
  useShushPill();
  return null;
}
