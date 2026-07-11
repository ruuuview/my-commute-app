// hooks/usePressAnimation.ts
import { useSharedValue, useAnimatedStyle, withSpring, withSequence, useReducedMotion } from 'react-native-reanimated';
import { useCallback } from 'react';
import * as Haptics from 'expo-haptics';

import { useUserPreferencesStore } from '../store/userPreferencesStore';

export const PRESS_PRESETS = {
  LINE_PILL_SELECT:   { scaleDown: 0.94, damping: 8, stiffness: 200 },
  LINE_PILL_DESELECT: { scaleDown: 0.94, damping: 8, stiffness: 200 },
  STATION_ROW:        { scaleDown: 0.94, damping: 8, stiffness: 200 },
  CONTINUE_BTN:       { scaleDown: 0.94, damping: 8, stiffness: 180 },
  BACK_BTN:           { scaleDown: 0.94, damping: 8, stiffness: 200 },
  SKIP_BTN:           { scaleDown: 0.95, damping: 10, stiffness: 220 },
  NAV_BAR_ITEM:       { scaleDown: 0.88, scaleUp: 1.04, damping: 8, stiffness: 200 },
  DEPARTURE_CARD:     { scaleDown: 0.94, damping: 8, stiffness: 200 },
  CHIP:               { scaleDown: 0.94, damping: 8, stiffness: 200 }
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
  const reducedMotion = useReducedMotion();
  const hapticsEnabled = useUserPreferencesStore(state => state.hapticsEnabled !== false);

  const mappedKey = (KEY_MAP[configKey] || configKey) as keyof typeof PRESS_PRESETS;
  const config = PRESS_PRESETS[mappedKey];

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const onPressIn = useCallback(() => {
    if (disabled || reducedMotion) return;

    const isPill = mappedKey === 'LINE_PILL_SELECT' || mappedKey === 'LINE_PILL_DESELECT';
    if (!isPill && hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    const target = config.scaleDown;
    scale.value = withSpring(target, {
      damping: config.damping,
      stiffness: config.stiffness,
    });
  }, [config, mappedKey, disabled, reducedMotion, scale, hapticsEnabled]);

  const onPressOut = useCallback(() => {
    if (disabled || reducedMotion) {
      scale.value = 1;
      return;
    }
    const overshoot = 'scaleUp' in config ? config.scaleUp : undefined;
    if (overshoot && overshoot > 1.0) {
      scale.value = withSequence(
        withSpring(overshoot, {
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
  }, [config, disabled, reducedMotion, scale]);

  return {
    onPressIn,
    onPressOut,
    animatedStyle,
  };
}
