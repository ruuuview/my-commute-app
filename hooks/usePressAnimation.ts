// hooks/usePressAnimation.ts
import { useSharedValue, useAnimatedStyle, withSpring, useReducedMotion, withSequence } from 'react-native-reanimated';
import { useCallback } from 'react';

export type PressType = 
  | 'line_select' | 'line_deselect' | 'station_row' 
  | 'continue_btn' | 'back_btn' | 'skip_btn' 
  | 'nav_item' | 'departure_card';

const PHYSICS_CONFIGS = {
  line_select:    { damping: 12, stiffness: 200, target: 0.94, overshoot: 1.04 },
  line_deselect:  { damping: 16, stiffness: 180, target: 0.96, overshoot: undefined },
  station_row:    { damping: 20, stiffness: 260, target: 0.97, overshoot: undefined },
  continue_btn:   { damping: 14, stiffness: 180, target: 0.96, overshoot: undefined },
  back_btn:       { damping: 18, stiffness: 200, target: 0.95, overshoot: undefined },
  skip_btn:       { damping: 22, stiffness: 240, target: 0.97, overshoot: undefined },
  nav_item:       { damping: 10, stiffness: 220, target: 0.88, overshoot: 1.0 },
  departure_card: { damping: 24, stiffness: 300, target: 0.98, overshoot: undefined }
};

export function usePressAnimation(configKey: PressType, disabled = false) {
  const scale = useSharedValue(1);
  const reducedMotion = useReducedMotion();
  const config = PHYSICS_CONFIGS[configKey];

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const onPressIn = useCallback(() => {
    if (disabled || reducedMotion) return;
    scale.value = withSpring(config.target, {
      damping: config.damping,
      stiffness: config.stiffness,
    });
  }, [config, disabled, reducedMotion]);

  const onPressOut = useCallback(() => {
    if (disabled || reducedMotion) {
      scale.value = 1;
      return;
    }
    if (config.overshoot && config.overshoot > 1.0) {
      scale.value = withSequence(
        withSpring(config.overshoot, {
          damping: config.damping,
          stiffness: config.stiffness,
        }),
        withSpring(1, {
          damping: config.damping,
          stiffness: config.stiffness,
        })
      );
    } else {
      scale.value = withSpring(1, {
        damping: config.damping,
        stiffness: config.stiffness,
      });
    }
  }, [config, disabled, reducedMotion]);

  return {
    onPressIn,
    onPressOut,
    animatedStyle,
  };
}
