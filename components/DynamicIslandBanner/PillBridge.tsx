// components/DynamicIslandBanner/PillBridge.tsx
// Bridges the transient pill store (store/pillStore.ts) to the vendored
// Dynamic Island (gooey) shell. Must be rendered INSIDE <DynamicNotifications>.
//
// The permission primer hook is self-driving: it observes the permission
// state machine and calls usePillStore.getState().requestPill(...) when a
// wanted permission is still missing. This component only mirrors the
// store's active pill into the gooey shell via trigger().
//
// PRIMERS-ONLY SCOPE (user-locked 2026-10-07): the in-app Morph Pill fires
// solely for permission primers (Live Activity / notification auth). All
// other triggers (boarding nudge, disruption edge, intent, setup-confirm,
// shush) are unmounted; the dashboard owns arrivals and disruptions.
//
// ONBOARDING GATE: the triggers live in <PillTriggers/>, mounted only after
// hasCompletedOnboarding. Pills are ambient main-app UI and must never drop
// over the onboarding setup screens.
//
// LEASE, not latch: the store slot is freed when the visual pill dies —
// tap, swipe, or the auto-timeout (durationMs, default 4000 ms). Without
// this, a primer shown once at launch would starve the next primer in the
// rotation for the whole session. A tap runs the pill's onPress first; the
// slot is cleared afterwards unless the tap's own handler already swapped
// in a replacement pill.

import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { createMMKV } from 'react-native-mmkv';
import { useSegments } from 'expo-router';
import { useAnimatedReaction, runOnJS } from 'react-native-reanimated';
import { useDynamicNotifications } from './hooks';
import { usePillStore } from '../../store/pillStore';
import { useUserPreferencesStore } from '../../store/userPreferencesStore';
import { PillContent } from './PillContent';
import { usePillSuppression } from '../../hooks/usePillSuppression';
import { usePillSuppressionStore } from '../../store/pillSuppressionStore';

import { usePrimerPill } from '../../hooks/usePrimerPill';

export const DEFAULT_PILL_DURATION_MS = 4000;
export const MICRO_PILL_DURATION_MS = 1500;

export function PillBridge(): React.JSX.Element | null {
  const { trigger, dismiss, reveal } = useDynamicNotifications();
  const active = usePillStore((s) => s.active);
  const onboardingDone = useUserPreferencesStore((s) => s.hasCompletedOnboarding);
  const suppressed = usePillSuppressionStore((s) => s.isSuppressed);
  const segments = useSegments();
  const pathSegments = (segments as string[]) || [];
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false);
  const settlingIdRef = useRef<string | null>(null);

  const onSettle = React.useCallback(() => {
    if (AppState.currentState !== 'active') return;
    const id = settlingIdRef.current;
    if (!id) return;
    const lineId = id.split(':')[0];
    if (lineId) {
      try {
        const notifStorage = createMMKV({ id: 'background-storage' });
        notifStorage.set(`notified_disruption_${lineId}`, Date.now());
      } catch {
        // Fallback if MMKV unavailable
      }
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((enabled) => {
        if (mounted) setScreenReaderEnabled(enabled);
      })
      .catch(() => { });

    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', (enabled) => {
      if (mounted) setScreenReaderEnabled(enabled);
    });

    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  // Dashboard routes: [] (root), ['(tabs)', 'index'], or ['index'].
  // Also permits settings screen and test-prefixed pills for manual testing.
  const isDashboardRoute =
    pathSegments.length === 0 ||
    (pathSegments.length === 1 && (pathSegments[0] === 'index' || pathSegments[0] === '(tabs)' || pathSegments[0] === 'settings')) ||
    (pathSegments.length === 2 && pathSegments[0] === '(tabs)' && pathSegments[1] === 'index') ||
    Boolean(active?.id?.startsWith('test-'));

  usePillSuppression('onboarding', !onboardingDone);
  usePillSuppression('route', !isDashboardRoute);

  // Settle-confirmed MMKV recording driven directly by the animation timeline's reveal value:
  // - Writes ONLY when reveal.value reaches settle (>= 0.98), ensuring the pill is 100% visually rendered.
  // - Gated by AppState: if backgrounded or inactive mid-animation, the write is aborted.
  // - onSettle executes purely on JS thread via standard runOnJS.
  useAnimatedReaction(
    () => (reveal ? reveal.value : 0),
    (val, prev) => {
      'worklet';
      if (val >= 0.98 && (prev === null || prev < 0.98)) {
        runOnJS(onSettle)();
      }
    },
    [onSettle, reveal]
  );

  useEffect(() => {
    if (suppressed) {
      settlingIdRef.current = null;
      dismiss();
      if (active) usePillStore.getState().clearPill();
      return;
    }
    if (!active) {
      settlingIdRef.current = null;
      dismiss();
      return;
    }
    const pillId = active.id;
    settlingIdRef.current = active.kind === 'disruption' ? active.id : null;

    // When Screen Reader (VoiceOver) is active or durationMs is explicitly null, avoid auto-timeout
    const baseDuration = active.durationMs === null ? null : (active.durationMs === undefined ? DEFAULT_PILL_DURATION_MS : active.durationMs);
    const durationMs = screenReaderEnabled ? null : baseDuration;

    trigger({
      id: active.id,
      title: active.title,
      message: active.message,
      accent: active.accent,
      beamAccent: active.beamAccent,
      tier: active.tier,
      duration: durationMs,
      onPress: () => {
        const before = usePillStore.getState().active;
        try {
          const actionFn = active.onAction ?? active.onPress;
          actionFn?.();
        } finally {
          // The shell visually dismisses on tap. Free the store slot unless
          // the tap's handler already swapped in a replacement pill.
          const s = usePillStore.getState();
          if (s.active?.id === before?.id) s.clearPill();
        }
      },
      render: () => {
        // Thread the primer key deterministically: usePrimerPill ids every
        // primer pill `primer-<key>`, so the icon never depends on copy.
        const rawKey = active.id.startsWith('primer-') ? active.id.slice('primer-'.length) : '';
        const primerKey =
          rawKey === 'locationAlways' || rawKey === 'notifications' ? rawKey : undefined;
        return (
          <PillContent
            title={active.title}
            message={active.message}
            accent={active.accent}
            tier={active.tier}
            actionLabel={active.actionLabel}
            stationCode={active.stationCode}
            shortLine={active.shortLine}
            primerKey={primerKey}
          />
        );
      },
    });

    let autoDismissTimer: ReturnType<typeof setTimeout> | null = null;
    if (durationMs !== null) {
      autoDismissTimer = setTimeout(() => {
        const s = usePillStore.getState();
        if (s.active?.id === pillId) {
          try {
            s.active?.onDismiss?.();
          } finally {
            s.clearPill();
          }
        }
      }, durationMs);
    }

    return () => {
      settlingIdRef.current = null;
      if (autoDismissTimer) clearTimeout(autoDismissTimer);
    };
  }, [active, dismiss, screenReaderEnabled, suppressed, trigger]);

  // The in-app pill is an ambient companion for the main app — it must never
  // fire during the focused onboarding flow, where it would drop over the
  // setup screens (e.g. the permission primer landing on top of the "Your
  // lines" header). The triggers mount only after onboarding completes, so
  // their mount-time evaluation runs exactly once, on the dashboard.
  return onboardingDone && !suppressed ? <PillTriggers /> : null;
}

/**
 * Self-driving in-app Morph Pill triggers — primers only (user-locked
 * 2026-10-07). Drops the permission primer pill when Live Activity or
 * notification authorization is still missing; nothing else fires here.
 */
function PillTriggers(): null {
  usePrimerPill();
  return null;
}
