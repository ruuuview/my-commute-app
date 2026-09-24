// hooks/useJiggle.ts
// ─────────────────────────────────────────────────────────────────
// DIRECT MANIPULATION TRANSIT ARCHITECTURE
// Jiggle mode and edit/done modal modes are stripped in favor of
// direct long-press drag and AppleSwipeableRow gestures.
// ─────────────────────────────────────────────────────────────────
import { useMemo } from 'react';
import { useAnimatedStyle, useSharedValue, SharedValue } from 'react-native-reanimated';
import { useLiveReducedMotion } from './useReducedMotion';

export { useLiveReducedMotion };

export interface JiggleDriver {
  amplitude: SharedValue<number>;
  active: boolean;
}

export function useJiggleDriver(_isEditing: boolean = false): JiggleDriver {
  const amplitude = useSharedValue(0);
  return useMemo(() => ({ amplitude, active: false }), [amplitude]);
}

export function useJiggle(
  _driver?: JiggleDriver,
  _indexOrSeed: number | string = 0,
  _isActive: boolean = false
) {
  return useAnimatedStyle(() => ({}));
}

