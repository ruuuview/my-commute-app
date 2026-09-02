import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  SharedValue,
} from 'react-native-reanimated';

export const SAFE_ROTATION_DEG = 0.95; // Unified synchronous Apple-style jiggle rotation
export const JIGGLE_DEG = SAFE_ROTATION_DEG; // Backward compat alias
export const JIGGLE_MS = 120;

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
  const isReanimatedReduced = useReducedMotion();
  const [a11yReduceMotion, setA11yReduceMotion] = useState(false);
  const isActiveShared = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setA11yReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setA11yReduceMotion);
    return () => sub.remove();
  }, []);

  const reducedMotion = isReanimatedReduced || a11yReduceMotion;

  useEffect(() => {
    isActiveShared.value = isActive ? 1 : 0;
  }, [isActive, isActiveShared]);

  const animatedStyle = useAnimatedStyle(() => {
    const active = isActiveShared.value === 1;

    // 1. Zero-Angle Settle on Exit
    if (!isEditing && !active) {
      return {
        transform: [{ rotate: '0deg' }, { translateX: 0 }, { translateY: 0 }, { scale: 1 }],
        zIndex: 1,
        shadowOpacity: options?.baselineShadowOpacity ?? 0,
        shadowRadius: options?.baselineShadowRadius ?? 0,
        elevation: options?.baselineElevation ?? 0,
      };
    }

    // 2. Drag-Lift Invariant: Freeze rotation, scale to 1.04x, elevation shadow
    if (active) {
      return {
        transform: [{ rotate: '0deg' }, { translateX: 0 }, { translateY: 0 }, { scale: 1.04 }],
        zIndex: 999,
        shadowOpacity: 0.35,
        shadowRadius: 16,
        elevation: 12,
      };
    }

    // 3. Reduced Motion safety
    if (reducedMotion) {
      return {
        transform: [{ rotate: '0deg' }, { translateX: 0 }, { translateY: 0 }, { scale: 1 }],
        zIndex: 1,
        shadowOpacity: options?.baselineShadowOpacity ?? 0,
        shadowRadius: options?.baselineShadowRadius ?? 0,
        elevation: options?.baselineElevation ?? 0,
      };
    }

    // 4. Synchronous Unified Harmonic Jiggle (100% Phase Lock across all cards)
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
