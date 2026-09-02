import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  cancelAnimation,
  SharedValue,
} from 'react-native-reanimated';

export const SAFE_ROTATION_DEG = 0.62; // Aspect-ratio clamped max rotation to prevent corner overhang
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
  const isEditingShared = useSharedValue(isEditing ? 1 : 0);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setA11yReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setA11yReduceMotion);
    return () => sub.remove();
  }, []);

  const reducedMotion = isReanimatedReduced || a11yReduceMotion;

  useEffect(() => {
    isActiveShared.value = isActive ? 1 : 0;
  }, [isActive, isActiveShared]);

  useEffect(() => {
    isEditingShared.value = isEditing ? 1 : 0;
  }, [isEditing, isEditingShared]);

  // Unmount cleanup: cancel worklets to prevent memory leaks + Hermes crashes
  useEffect(() => {
    return () => {
      if (globalJiggle) {
        cancelAnimation(globalJiggle);
      }
    };
  }, [globalJiggle]);

  const animatedStyle = useAnimatedStyle(() => {
    const active = isActiveShared.value === 1;
    const editing = isEditingShared.value === 1;

    // 1. Zero-Angle Settle on Exit
    if (!editing && !active) {
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

    // 4. Harmonic Anti-Phase Jiggle (Aspect-Clamped 0.62°)
    const factor = globalJiggle ? globalJiggle.value : 0;
    const direction = index % 2 === 0 ? 1 : -1;
    const rotVal = factor * SAFE_ROTATION_DEG * direction;

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
