import { useEffect } from 'react';
import {
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  SharedValue,
} from 'react-native-reanimated';

export const JIGGLE_DEG = 1.25;
export const PHASE_OFFSET = 0.72;
export const JIGGLE_MS = 220;

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

    // 1. Zero-Angle Settle on Exit: explicitly reset to 0deg and 1.0 scale
    if (!editing && !active) {
      return {
        transform: [{ rotate: '0deg' }, { scale: 1 }],
        zIndex: 1,
        shadowOpacity: options?.baselineShadowOpacity ?? 0,
        shadowRadius: options?.baselineShadowRadius ?? 0,
        elevation: options?.baselineElevation ?? 0,
      };
    }

    // 2. Drag-Lift Invariant: Freeze rotation at 0deg, scale up to 1.04x, elevate drop shadow
    if (active) {
      return {
        transform: [{ rotate: '0deg' }, { scale: 1.04 }],
        zIndex: 999,
        shadowOpacity: 0.35,
        shadowRadius: 16,
        elevation: 12,
      };
    }

    // 3. Reduced Motion safety
    if (reducedMotion) {
      return {
        transform: [{ rotate: '0deg' }, { scale: 1 }],
        zIndex: 1,
        shadowOpacity: options?.baselineShadowOpacity ?? 0,
        shadowRadius: options?.baselineShadowRadius ?? 0,
        elevation: options?.baselineElevation ?? 0,
      };
    }

    // 4. Organic Harmonic Physics: theta_i(t) = JIGGLE_DEG * sin(t + i * 0.72)
    const t = globalJiggle ? globalJiggle.value : 0;
    const rotVal = JIGGLE_DEG * Math.sin(t + index * PHASE_OFFSET);
    const rotStr = `${rotVal}deg`;

    return {
      transform: [{ rotate: rotStr }, { scale: 1 }],
      zIndex: 1,
      shadowOpacity: options?.baselineShadowOpacity ?? 0,
      shadowRadius: options?.baselineShadowRadius ?? 0,
      elevation: options?.baselineElevation ?? 0,
    };
  });

  return animatedStyle;
};
