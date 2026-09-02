import { useEffect } from 'react';
import {
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  SharedValue,
} from 'react-native-reanimated';

export const SAFE_ROTATION_DEG = 0.62; // Aspect-ratio-safe maximum for 370px cards with 8px gutters
export const JIGGLE_DEG = SAFE_ROTATION_DEG; // Backward compat alias
export const JIGGLE_MS = 200;

export const useJiggle = (
  isEditing: boolean,
  isActive: boolean,
  globalJiggle?: SharedValue<number>,
  index: number = 0,
  options?: {
    baselineShadowOpacity?: number;
    baselineShadowRadius?: number;
    baselineElevation?: number;
  }
) => {
  const reducedMotion = useReducedMotion();
  const isActiveShared = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    isActiveShared.value = isActive ? 1 : 0;
  }, [isActive, isActiveShared]);

  const animatedStyle = useAnimatedStyle(() => {
    const active = isActiveShared.value === 1;

    // 1. Drag-Lift Invariant: Freeze rotation, scale to 1.04x, elevation shadow
    if (active) {
      return {
        transform: [{ rotate: '0deg' }, { translateX: 0 }, { translateY: 0 }, { scale: 1.04 }],
        zIndex: 999,
        shadowOpacity: 0.35,
        shadowRadius: 16,
        elevation: 12,
      };
    }

    // 2. Reduced Motion safety
    if (reducedMotion) {
      return {
        transform: [{ rotate: '0deg' }, { translateX: 0 }, { translateY: 0 }, { scale: 1 }],
        zIndex: 1,
        shadowOpacity: options?.baselineShadowOpacity ?? 0,
        shadowRadius: options?.baselineShadowRadius ?? 0,
        elevation: options?.baselineElevation ?? 0,
      };
    }

    // 3. Synchronous Unified Harmonic Jiggle + 200ms Smooth Settle driven by globalJiggle
    const factor = globalJiggle ? globalJiggle.value : 0;
    const rotVal = factor * SAFE_ROTATION_DEG;

    return {
      transform: [
        { rotate: `${rotVal}deg` },
        { scale: 1 },
      ],
      zIndex: 1,
      shadowOpacity: options?.baselineShadowOpacity ?? 0,
      shadowRadius: options?.baselineShadowRadius ?? 0,
      elevation: options?.baselineElevation ?? 0,
    };
  });

  return animatedStyle;
};
