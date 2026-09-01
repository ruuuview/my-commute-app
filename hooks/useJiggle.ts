import { useEffect } from 'react';
import {
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  SharedValue,
} from 'react-native-reanimated';

// Apple Wide-Widget Golden Ratio Constants:
// On wide 350pt cards, 0.75° rotation + 0.6px micro-float matches
// native iOS widget stack jiggle without text vibration or harsh flutter.
export const JIGGLE_DEG = 0.75;
export const JIGGLE_TRANSLATE_Y = 0.6;
export const JIGGLE_MS = 110;

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
        transform: [{ rotate: '0deg' }, { translateY: 0 }, { scale: 1 }],
        zIndex: 1,
        shadowOpacity: options?.baselineShadowOpacity ?? 0,
        shadowRadius: options?.baselineShadowRadius ?? 0,
        elevation: options?.baselineElevation ?? 0,
      };
    }

    // 2. Drag-Lift Invariant: Freeze rotation, scale to 1.04x, elevation shadow
    if (active) {
      return {
        transform: [{ rotate: '0deg' }, { translateY: 0 }, { scale: 1.04 }],
        zIndex: 999,
        shadowOpacity: 0.35,
        shadowRadius: 16,
        elevation: 12,
      };
    }

    // 3. Reduced Motion safety
    if (reducedMotion) {
      return {
        transform: [{ rotate: '0deg' }, { translateY: 0 }, { scale: 1 }],
        zIndex: 1,
        shadowOpacity: options?.baselineShadowOpacity ?? 0,
        shadowRadius: options?.baselineShadowRadius ?? 0,
        elevation: options?.baselineElevation ?? 0,
      };
    }

    // 4. Apple SpringBoard Physics (Sinusoidal Eased Oscillations):
    // Continuous harmonic swing without boundary ticks
    const factor = globalJiggle ? globalJiggle.value : 0;
    const rotPhase = (index % 2 === 0) ? 1 : -0.85;
    const transPhase = (index % 3 === 0) ? 1 : -0.75;

    const rotVal = JIGGLE_DEG * factor * rotPhase;
    const transVal = JIGGLE_TRANSLATE_Y * factor * transPhase;

    return {
      transform: [
        { rotate: `${rotVal}deg` },
        { translateY: transVal },
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
