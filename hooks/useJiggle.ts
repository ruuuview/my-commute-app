import { useEffect } from 'react';
import {
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  SharedValue,
} from 'react-native-reanimated';

export const JIGGLE_DEG = 1.05;
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
  const reducedMotion = useReducedMotion();
  const isActiveShared = useSharedValue(isActive ? 1 : 0);
  const isEditingShared = useSharedValue(isEditing ? 1 : 0);

  useEffect(() => {
    isActiveShared.value = isActive ? 1 : 0;
  }, [isActive, isActiveShared]);

  useEffect(() => {
    isEditingShared.value = isEditing ? 1 : 0;
  }, [isEditing, isEditingShared]);

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

    // 4. Harmonic Anti-Phase Jiggle (Pure Continuous Alternating Wobble)
    const factor = globalJiggle ? globalJiggle.value : 0;
    const direction = index % 2 === 0 ? 1 : -1;
    const rotVal = factor * JIGGLE_DEG * direction;

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
