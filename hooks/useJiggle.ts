import { useEffect } from 'react';
import { 
  useAnimatedStyle, 
  useSharedValue, 
  withRepeat, 
  withSequence, 
  withTiming, 
  cancelAnimation,
  useReducedMotion,
  Easing,
  SharedValue
} from 'react-native-reanimated';
import { GLASS } from '../theme/colors';

export const JIGGLE_DEG = 1.2;
export const JIGGLE_MS = 100;

export const useJiggle = (
  isEditing: boolean,
  isActive: boolean,
  globalJiggle?: SharedValue<number>,
  options?: {
    baselineShadowOpacity?: number;
    baselineShadowRadius?: number;
    baselineElevation?: number;
  }
) => {
  const reducedMotion = useReducedMotion();
  const rotation = useSharedValue(0);
  const isActiveShared = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    isActiveShared.value = isActive ? 1 : 0;
  }, [isActive, isActiveShared]);

  useEffect(() => {
    if (globalJiggle) return;

    if (isActive || reducedMotion) {
      cancelAnimation(rotation);
      rotation.value = 0;
    } else if (isEditing) {
      // ±JIGGLE_DEG rotation jiggle
      rotation.value = withRepeat(
        withSequence(
          withTiming(-JIGGLE_DEG, { duration: JIGGLE_MS, easing: Easing.inOut(Easing.sin) }),
          withTiming(JIGGLE_DEG, { duration: JIGGLE_MS, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        false
      );
    } else {
      cancelAnimation(rotation);
      rotation.value = withTiming(0, { duration: 150 });
    }
  }, [isEditing, isActive, rotation, reducedMotion, globalJiggle]);

  const animatedStyle = useAnimatedStyle(() => {
    const active = isActiveShared.value === 1;
    const rotVal = active ? 0 : (globalJiggle ? globalJiggle.value : rotation.value);
    const rotStr = `${rotVal}deg`;

    // Baseline fallbacks matching regular glass theme card values
    const baseOpacity = options?.baselineShadowOpacity ?? GLASS.shadowOpacity;
    const baseRadius = options?.baselineShadowRadius ?? GLASS.shadowRadius;
    const baseElevation = options?.baselineElevation ?? 0;

    return {
      transform: [
        { rotate: rotStr },
        { scale: active ? 1.04 : 1 },
      ],
      zIndex: active ? 999 : 1,
      shadowOpacity: active ? 0.5 : baseOpacity,
      shadowRadius: active ? 24 : baseRadius,
      elevation: active ? 12 : baseElevation,
    };
  });

  return animatedStyle;
};
