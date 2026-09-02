// hooks/useJiggle.ts
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  Easing,
  SharedValue,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

// ── Geometry (single-column stack, 370dp cards, 12dp vertical gap) ──────
// Worst case = anti-phase neighbours: A's bottom corner drops while B's top
// corner rises. Gap closure = 2 · (w/2) · sin θ.
//   1.3° → 2·185·0.0227 = 8.4dp  → 3.6dp clearance  ✅ ships
//   1.8° → 2·185·0.0314 = 11.6dp → 0.4dp clearance  ⚠️ hard ceiling
export const JIGGLE_MAX_DEG = 1.3;
export const JIGGLE_DEG = JIGGLE_MAX_DEG;   // backward-compat alias
export const JIGGLE_PERIOD_MS = 420;        // full cycle ≈ 2.4 Hz (tune 380–480)
export const JIGGLE_IN_MS = 160;
export const JIGGLE_OUT_MS = 200;
const TWO_PI = Math.PI * 2;
const GOLDEN_ANGLE = 2.39996;               // rad ≈ 137.5°

export interface JiggleDriver {
  /** Linear clock 0→2π. Loops non-reversed — seamless because sin(0) === sin(2π). */
  phase: SharedValue<number>;
  /** 0 at rest → 1 while editing. Owns the entry ramp AND the exit settle. */
  amplitude: SharedValue<number>;
}

/** Live reduce-motion. Reanimated's useReducedMotion() is a boolean read once at launch. */
export function useLiveReducedMotion(): boolean {
  const initial = useReducedMotion();
  const [live, setLive] = useState<boolean>(Boolean(initial));
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setLive).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setLive);
    return () => sub.remove();
  }, []);
  return live;
}

/** ONE instance per dashboard. Owns the clock, the ramp, the settle, and cleanup. */
export function useJiggleDriver(isEditing: boolean): JiggleDriver {
  const phase = useSharedValue(0);
  const amplitude = useSharedValue(0);
  const reducedMotion = useLiveReducedMotion();

  useEffect(() => {
    if (isEditing && !reducedMotion) {
      // Restart the clock from 0. If we're re-entering mid-settle, the reset is
      // masked by the already-decayed amplitude (worst case < 0.4° — invisible).
      phase.value = 0;
      phase.value = withRepeat(
        withTiming(TWO_PI, { duration: JIGGLE_PERIOD_MS, easing: Easing.linear }),
        -1,
        false // non-reversed is CORRECT here: loop restarts at 0, and sin(0) === sin(2π)
      );
      amplitude.value = withTiming(1, { duration: JIGGLE_IN_MS, easing: Easing.out(Easing.quad) });
    } else {
      amplitude.value = withTiming(
        0,
        { duration: JIGGLE_OUT_MS, easing: Easing.out(Easing.cubic) },
        (finished) => {
          // Stop the clock ONLY once fully flat. If the user re-entered mid-settle,
          // this timing was cancelled (finished === false) and the clock lives on.
          if (finished) {
            cancelAnimation(phase);
            phase.value = 0;
          }
        }
      );
    }
  }, [isEditing, reducedMotion, phase, amplitude]);

  // Navigate away / unmount: kill both loops. No orphaned UI-thread worklets.
  useEffect(
    () => () => {
      cancelAnimation(phase);
      cancelAnimation(amplitude);
    },
    [phase, amplitude]
  );

  return useMemo(() => ({ phase, amplitude }), [phase, amplitude]);
}

/** Per-card consumer. Emits ONLY transform + zIndex. No shadow. No scale. */
export function useJiggle(driver: JiggleDriver | undefined, index: number, isActive: boolean) {
  const activeProgress = useSharedValue(isActive ? 1 : 0);
  useEffect(() => {
    // Eased flatten on lift instead of a 0/1 flip — no visible angle snap at drag start.
    activeProgress.value = withTiming(isActive ? 1 : 0, { duration: 120, easing: Easing.out(Easing.quad) });
  }, [isActive, activeProgress]);

  // Golden-angle spacing: unique phase per card; no two neighbours in lockstep or mirror.
  const offset = index * GOLDEN_ANGLE;

  return useAnimatedStyle(() => {
    if (!driver) return { transform: [{ rotate: '0deg' }], zIndex: 1 };
    const wobble = Math.sin(driver.phase.value + offset) * driver.amplitude.value * JIGGLE_MAX_DEG;
    const deg = wobble * (1 - activeProgress.value); // dragged card eases to flat
    return {
      transform: [{ rotate: `${deg}deg` }],
      zIndex: activeProgress.value > 0.5 ? 999 : 1,
    };
  });
}
