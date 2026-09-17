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
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  Easing,
  SharedValue,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

// ── Tuning knobs ──
export const JIGGLE_MAX_DEG = 0.6;        // Base rotation. ±1.9pt corners on a 361pt card.
                                           // Owner knob: raise toward 0.8 max — beyond that,
                                           // 12pt gaps start pumping again.
export const JIGGLE_BASE_PERIOD_MS = 820; // One full sway per ~0.8s (v2 was 340ms — 2.4× too fast).
export const JIGGLE_IN_MS = 220;          // Entry ramp — masks phase start, no angle snap.
export const JIGGLE_OUT_MS = 280;         // Exit settle — wobble eases to flat.
export const JIGGLE_BOB_PT = 0.9;         // Vertical float, quarter-phase offset from rotation.
export const JIGGLE_ENTRY_POP = 1.015;    // One-shot scale acknowledgment on entering edit mode.
                                           // Set to 1 to disable the pop entirely.

// Legacy aliases (kept so no stray import breaks)
export const JIGGLE_DEG = JIGGLE_MAX_DEG;
export const JIGGLE_PERIOD_MS = JIGGLE_BASE_PERIOD_MS;

const TWO_PI = Math.PI * 2;

export interface JiggleDriver {
  /** 0 at rest → 1 while editing. Ramps both directions so wobble never snaps. */
  amplitude: SharedValue<number>;
  /** JS-side mirror of the active state so per-card clocks start/stop with the mode. */
  active: boolean;
}

/** Live reduce-motion. Reanimated's useReducedMotion() is read once at launch. */
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

/** mulberry32 single-step. Deterministic per-card "wobble character":
 *  same seed → same phase/period/amplitude on every render. No unseeded RNG
 *  here — re-rolling character on re-render reads as the card glitching. */
function seededUnit(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function stringToSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
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
 *  Each card gets its OWN clock with a seeded phase offset, period (±15%), and
 *  amplitude (±20%) — the SpringBoard recipe. Ensemble result: at any instant
 *  cards lean at different angles, drifting in and out of alignment, never all
 *  synchronized in one direction or locked in opposition.
 *  Accepts `seed`: either a stable string ID (e.g. stationId) or numeric index. */
export function useJiggle(driver: JiggleDriver | undefined, seed: string | number, isActive: boolean) {
  const phase = useSharedValue(0);
  const activeProgress = useSharedValue(isActive ? 1 : 0);
  const settleScale = useSharedValue(1);

  const numericSeed = typeof seed === 'string' ? stringToSeed(seed) : seed;

  // Stable per-card wobble character (seeded — survives re-renders and reorders):
  const character = useMemo(
    () => ({
      offset: seededUnit(numericSeed) * TWO_PI,                                           // starting angle
      period: JIGGLE_BASE_PERIOD_MS * (0.85 + 0.3 * seededUnit(numericSeed + 101)),       // ±15% — periods drift apart
      deg: JIGGLE_MAX_DEG * (0.8 + 0.4 * seededUnit(numericSeed + 202)),                  // ±20% amplitude variety
      bob: JIGGLE_BOB_PT * (0.7 + 0.6 * seededUnit(numericSeed + 303)),                   // float variety
    }),
    [numericSeed]
  );

  // Dragged card eases flat + lifts (no angle snap at drag start).
  useEffect(() => {
    activeProgress.value = withTiming(isActive ? 1 : 0, { duration: 120, easing: Easing.out(Easing.quad) });
  }, [isActive, activeProgress]);

  // Per-card clock. Starts with the mode; on exit the clock freezes and the
  // shared amplitude envelope eases the card to flat — that IS the settle.
  useEffect(() => {
    if (driver?.active) {
      phase.value = character.offset;
      phase.value = withRepeat(
        withTiming(character.offset + TWO_PI, { duration: character.period, easing: Easing.linear }),
        -1,
        false // non-reversed is CORRECT: sin(offset) === sin(offset + 2π) — seamless loop
      );
      // One-shot entry acknowledgment: tiny scale pop, staggered down the list.
      settleScale.value = withDelay(
        Math.min((numericSeed % 8) * 20, 160),
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
  }, [driver?.active, character, numericSeed, phase, settleScale]);

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
    const deg = Math.sin(phase.value) * character.deg * env;
    // Quarter-phase float: card is centered at max tilt, bobs through center —
    // the "resting on glass" feel. Transform-only: never touches layout.
    const dy = Math.cos(phase.value) * character.bob * env;
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
