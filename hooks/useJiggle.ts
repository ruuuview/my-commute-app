// hooks/useJiggle.ts
// ─────────────────────────────────────────────────────────────────
// ORGANIC APPLE-STYLE JIGGLE — v3
// RATIFIED BY OWNER: jiggle mode is RETAINED — "make it better, don't kill it."
//
// v1 (golden angle) read as "chaotic": 1.2° × 340ms. Amplitude and speed were
//   the problem — phases only chose WHEN corners collided.
// v2 (± alternating polarity) read as "uneven": every adjacent pair rotated in
//   perfect opposition on a shared clock — a synchronized accordion pumping at
//   every 12pt seam, 2.94×/sec.
// Apple's actual recipe (SpringBoard): small amplitude (~1pt corner travel),
//   slow cadence (~1Hz per icon), per-icon decorrelated phases with slightly
//   different periods so relative alignment never repeats.
//
// Geometry budget (361pt card, 12pt gap): corner travel = 180.5 × sin(θ)
//   θ=1.2° → ±3.8pt (v2 — gaps breathed 4.4↔19.6pt: the ugliness)
//   θ=0.6° → ±1.9pt (v3 — gentle, decorrelated breathing)
// ─────────────────────────────────────────────────────────────────
import { useEffect, useMemo } from 'react';
import {
  Easing,
  SharedValue,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useLiveReducedMotion } from './useReducedMotion';

// Backward compatibility re-export; consumers should import from ./useReducedMotion directly.
export { useLiveReducedMotion };

// ── Tuning knobs ──
export const JIGGLE_MAX_DEG = 0.5;        // Uniform angle: ±0.5° (±1.57pt corner travel on a 361pt card)
export const JIGGLE_PERIOD_MS = 380;     // Snappy Apple-style wobble cadence (~380ms full cycle)
export const JIGGLE_BASE_PERIOD_MS = JIGGLE_PERIOD_MS;
export const JIGGLE_IN_MS = 220;          // Entry ramp — masks phase start, no angle snap
export const JIGGLE_OUT_MS = 280;         // Exit settle — wobble eases to flat
export const JIGGLE_VERTICAL_LIFT_PT = 0.6; // Uniform vertical bob
export const JIGGLE_BOB_PT = JIGGLE_VERTICAL_LIFT_PT; // Legacy alias
export const JIGGLE_ENTRY_POP = 1.015;    // One-shot scale acknowledgment on entering edit mode.

// Legacy aliases (kept so no stray import breaks)
export const JIGGLE_DEG = JIGGLE_MAX_DEG;

const TWO_PI = Math.PI * 2;

export interface JiggleDriver {
  /** 0 at rest → 1 while editing. Ramps both directions so wobble never snaps. */
  amplitude: SharedValue<number>;
  /** JS-side mirror of the active state so per-card clocks start/stop with the mode. */
  active: boolean;
}

/** ONE instance per dashboard. Owns the shared amplitude envelope (entry ramp +
 *  exit settle) and the reduce-motion kill switch. Per-card clocks live in useJiggle. */
export function useJiggleDriver(isEditing: boolean): JiggleDriver {
  const amplitude = useSharedValue(0);
  const reducedMotion = useLiveReducedMotion();
  const active = isEditing && !reducedMotion;

  useEffect(() => {
    if (active) {
      amplitude.value = withTiming(1, { duration: JIGGLE_IN_MS, easing: Easing.out(Easing.quad) });
    } else {
      amplitude.value = withTiming(0, { duration: JIGGLE_OUT_MS, easing: Easing.out(Easing.cubic) });
    }
  }, [active, amplitude]);

  // Unmount / navigate away: kill the envelope. Per-card loops clean themselves up.
  useEffect(() => () => { cancelAnimation(amplitude); }, [amplitude]);

  return useMemo(() => ({ amplitude, active }), [amplitude, active]);
}

/** Per-card consumer. Emits transform + zIndex.
 *  Uniform Apple-style jiggle:
 *  - Uniform frequency (380ms) and uniform angle (0.50°) across all cards.
 *  - Strict alternating polarity based on index % 2 (L, R, L, R).
 *  - In-phase vertical float (0.6pt) so all cards buoy harmonically.
 *  - Harmonic pendulum easing (Easing.inOut(Easing.sin)) for natural physical swing.
 *  - Background cards continue wobbling during drag while the active card eases flat via isActive.
 */
export function useJiggle(driver: JiggleDriver | undefined, indexOrSeed: number | string = 0, isActive: boolean = false) {
  const phase = useSharedValue(0);
  const activeProgress = useSharedValue(isActive ? 1 : 0);
  const settleScale = useSharedValue(1);

  const index = typeof indexOrSeed === 'number' ? indexOrSeed : 0;
  const rotationOffset = index % 2 === 0 ? 0 : Math.PI;

  // Dragged card eases flat + lifts (no angle snap at drag start).
  useEffect(() => {
    activeProgress.value = withTiming(isActive ? 1 : 0, { duration: 120, easing: Easing.out(Easing.quad) });
  }, [isActive, activeProgress]);

  // Per-card clock. Synchronized loop with index % 2 polarity alternation and harmonic sine easing.
  useEffect(() => {
    if (driver?.active) {
      phase.value = 0;
      phase.value = withRepeat(
        withTiming(TWO_PI, { duration: JIGGLE_PERIOD_MS, easing: Easing.inOut(Easing.sin) }),
        -1,
        false // non-reversed is CORRECT: sin(offset) === sin(offset + 2π) — seamless loop
      );
      // One-shot entry acknowledgment: tiny scale pop, staggered down the list.
      settleScale.value = withDelay(
        Math.min((index % 8) * 20, 160),
        withSequence(
          withTiming(JIGGLE_ENTRY_POP, { duration: 110, easing: Easing.out(Easing.quad) }),
          withSpring(1, { damping: 16, stiffness: 220 })
        )
      );
    } else {
      cancelAnimation(phase);
      cancelAnimation(settleScale);
      settleScale.value = withTiming(1, { duration: 140 });
    }
  }, [driver?.active, index, phase, settleScale]);

  // Unmount: no orphaned UI-thread loops.
  useEffect(
    () => () => {
      cancelAnimation(phase);
      cancelAnimation(settleScale);
    },
    [phase, settleScale]
  );

  return useAnimatedStyle(() => {
    const env = (driver ? driver.amplitude.value : 0) * (1 - activeProgress.value);
    const deg = Math.sin(phase.value + rotationOffset) * JIGGLE_MAX_DEG * env;
    // In-phase vertical float: all cards bob buoyantly on the same water level
    const dy = Math.cos(phase.value) * JIGGLE_VERTICAL_LIFT_PT * env;
    return {
      transform: [
        { translateY: dy },
        { rotate: `${deg}deg` },
        { scale: settleScale.value },
      ],
      zIndex: activeProgress.value > 0.5 ? 999 : 1,
    };
  });
}
