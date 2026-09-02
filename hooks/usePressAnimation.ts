// hooks/usePressAnimation.ts
import { useEffect, useState, useRef, useCallback } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  useReducedMotion,
  cancelAnimation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useUserPreferencesStore } from '../store/userPreferencesStore';

// ── Timing ──────────────────────────────────────────────────────────
const LIFT_IN_MS = 90;    // Sub-100ms = instantaneous (Apple HIG)
const LIFT_OUT_MS = 220;  // Leisurely settle reads as elegant, not snappy
const LIFT_EASING = Easing.out(Easing.cubic);
const DEBOUNCE_LOCKOUT_MS = 150;

// ── Ghost Shadow (imperceptible at rest, growth origin for animation) ──
const LIFT_REST = {
  shadowRadius: 4,
  shadowOpacity: 0.06,
  shadowOffsetY: 2,
  elevation: 2,
  borderOpacity: 0.48, // Matches GLASS.borderColor rgba(255,255,255,0.48)
};

// ── Lifted State ────────────────────────────────────────────────────
const LIFT_ACTIVE = {
  shadowRadius: 22,
  shadowOpacity: 0.35,
  shadowOffsetY: 8,     // Offset grows (depth cue)
  elevation: 12,
  borderOpacity: 0.60,  // Glass brightening
};

export const PRESS_PRESETS = {
  LINE_PILL_SELECT:   { scaleUp: 1.025 },
  LINE_PILL_DESELECT: { scaleUp: 1.025 },
  STATION_ROW:        { scaleUp: 1.025 },
  CONTINUE_BTN:       { scaleUp: 1.025 },
  BACK_BTN:           { scaleUp: 1.025 },
  SKIP_BTN:           { scaleUp: 1.025 },
  NAV_BAR_ITEM:       { scaleUp: 1.025 },
  DEPARTURE_CARD:     { scaleUp: 1.025 },
  CHIP:               { scaleUp: 1.025 },
} as const;

export type PressType =
  | keyof typeof PRESS_PRESETS
  | 'line_select'
  | 'line_deselect'
  | 'station_row'
  | 'continue_btn'
  | 'back_btn'
  | 'skip_btn'
  | 'nav_item'
  | 'departure_card'
  | 'chip';

const KEY_MAP: Record<string, keyof typeof PRESS_PRESETS> = {
  line_select: 'LINE_PILL_SELECT',
  line_deselect: 'LINE_PILL_DESELECT',
  station_row: 'STATION_ROW',
  continue_btn: 'CONTINUE_BTN',
  back_btn: 'BACK_BTN',
  skip_btn: 'SKIP_BTN',
  nav_item: 'NAV_BAR_ITEM',
  departure_card: 'DEPARTURE_CARD',
  chip: 'CHIP',
};

export function usePressAnimation(configKey: PressType, disabled = false) {
  const scale = useSharedValue(1);
  const shadowRadius = useSharedValue(LIFT_REST.shadowRadius);
  const shadowOpacity = useSharedValue(LIFT_REST.shadowOpacity);
  const shadowOffsetY = useSharedValue(LIFT_REST.shadowOffsetY);
  const liftElevation = useSharedValue(LIFT_REST.elevation);
  const borderOpacity = useSharedValue(LIFT_REST.borderOpacity);

  const isReanimatedReducedMotion = useReducedMotion();
  const [a11yReduceMotion, setA11yReduceMotion] = useState(false);
  const lastTapTime = useRef(0);
  const pressStartTime = useRef(0);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setA11yReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setA11yReduceMotion);
    return () => sub.remove();
  }, []);

  const reduceMotion = isReanimatedReducedMotion || a11yReduceMotion;
  const hapticsEnabled = useUserPreferencesStore(state => state.hapticsEnabled !== false);

  const mappedKey = (KEY_MAP[configKey] || configKey) as keyof typeof PRESS_PRESETS;
  const config = PRESS_PRESETS[mappedKey] ?? { scaleUp: 1.025 };

  // Scale-only — safe for ALL 14 consumers. Zero side effects.
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Opt-in shadow lift — consumer applies to outer shadow-hosting layer.
  // Uses #000 shadowColor (overrides GLASS.shadowColor which is transparent).
  const liftShadowStyle = useAnimatedStyle(() => ({
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: shadowOffsetY.value },
    shadowRadius: shadowRadius.value,
    shadowOpacity: shadowOpacity.value,
    elevation: liftElevation.value,
  }));

  // Opt-in border brightening — consumer applies to inner border-hosting layer.
  const liftBorderStyle = useAnimatedStyle(() => ({
    borderColor: `rgba(255, 255, 255, ${borderOpacity.value})`,
  }));

  const cancelAll = useCallback(() => {
    cancelAnimation(scale);
    cancelAnimation(shadowRadius);
    cancelAnimation(shadowOpacity);
    cancelAnimation(shadowOffsetY);
    cancelAnimation(liftElevation);
    cancelAnimation(borderOpacity);
  }, [scale, shadowRadius, shadowOpacity, shadowOffsetY, liftElevation, borderOpacity]);

  const onPressIn = useCallback(() => {
    if (disabled || reduceMotion) return;

    const now = Date.now();
    if (now - lastTapTime.current < DEBOUNCE_LOCKOUT_MS) return;
    lastTapTime.current = now;
    pressStartTime.current = now;

    if (hapticsEnabled) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    // Cancel previous return animations
    cancelAll();

    const timingConfig = { duration: LIFT_IN_MS, easing: LIFT_EASING };
    scale.value = withTiming(config.scaleUp, timingConfig);
    shadowRadius.value = withTiming(LIFT_ACTIVE.shadowRadius, timingConfig);
    shadowOpacity.value = withTiming(LIFT_ACTIVE.shadowOpacity, timingConfig);
    shadowOffsetY.value = withTiming(LIFT_ACTIVE.shadowOffsetY, timingConfig);
    liftElevation.value = withTiming(LIFT_ACTIVE.elevation, timingConfig);
    borderOpacity.value = withTiming(LIFT_ACTIVE.borderOpacity, timingConfig);
  }, [config, disabled, reduceMotion, scale, shadowRadius, shadowOpacity, shadowOffsetY, liftElevation, borderOpacity, hapticsEnabled, cancelAll]);

  const onPressOut = useCallback(() => {
    if (disabled || reduceMotion) {
      cancelAll();
      scale.value = 1;
      shadowRadius.value = LIFT_REST.shadowRadius;
      shadowOpacity.value = LIFT_REST.shadowOpacity;
      shadowOffsetY.value = LIFT_REST.shadowOffsetY;
      liftElevation.value = LIFT_REST.elevation;
      borderOpacity.value = LIFT_REST.borderOpacity;
      return;
    }

    // Ensure quick single taps complete full apex before settling back
    const elapsed = Date.now() - pressStartTime.current;
    const remainingHold = Math.max(0, LIFT_IN_MS - elapsed);
    const timingConfig = { duration: LIFT_OUT_MS, easing: LIFT_EASING };

    scale.value = withDelay(remainingHold, withTiming(1.0, timingConfig));
    shadowRadius.value = withDelay(remainingHold, withTiming(LIFT_REST.shadowRadius, timingConfig));
    shadowOpacity.value = withDelay(remainingHold, withTiming(LIFT_REST.shadowOpacity, timingConfig));
    shadowOffsetY.value = withDelay(remainingHold, withTiming(LIFT_REST.shadowOffsetY, timingConfig));
    liftElevation.value = withDelay(remainingHold, withTiming(LIFT_REST.elevation, timingConfig));
    borderOpacity.value = withDelay(remainingHold, withTiming(LIFT_REST.borderOpacity, timingConfig));
  }, [disabled, reduceMotion, scale, shadowRadius, shadowOpacity, shadowOffsetY, liftElevation, borderOpacity, cancelAll]);

  return {
    onPressIn,
    onPressOut,
    animatedStyle,      // Scale-only — ALL 14 consumers
    liftShadowStyle,    // Shadow + elevation — outer container opt-in
    liftBorderStyle,    // Border brightening — inner container opt-in
  };
}
