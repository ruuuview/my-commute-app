// components/BouncyPressable.tsx
// Universal tappable wrapper for every interactive element in the app.
// Central Config: snaps to PREMIUM_SPRING_CONFIG from theme/physics.
// Reduced Motion: safeguards against motion-induced flickering when accessibility is active.

import React from 'react';
import { Platform, Pressable, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  useReducedMotion,
} from 'react-native-reanimated';
import { PREMIUM_SPRING_CONFIG } from '../theme/physics';

interface Props {
  onPress?: () => void;
  onLongPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  style?: StyleProp<ViewStyle>;
  animatedStyle?: StyleProp<ViewStyle>;
  disabled?: boolean;
  children: React.ReactNode;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'checkbox' | 'link' | 'none';
  accessibilityState?: object;
  accessibilityHint?: string;
  hitSlop?: { top?: number; bottom?: number; left?: number; right?: number };
}

export default function BouncyPressable({
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  style,
  animatedStyle,
  disabled = false,
  children,
  accessibilityLabel,
  accessibilityRole,
  accessibilityState,
  accessibilityHint,
  hitSlop,
}: Props) {
  const scale = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  const springStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (reducedMotion) return;
    scale.value = withSpring(0.96, PREMIUM_SPRING_CONFIG);
    onPressIn?.();
  };

  const handlePressOut = () => {
    if (reducedMotion) return;
    scale.value = withSpring(1, PREMIUM_SPRING_CONFIG);
    onPressOut?.();
  };

  return (
    <Animated.View style={[springStyle, animatedStyle]}>
      <Pressable
        onPress={disabled ? undefined : onPress}
        unstable_pressDelay={Platform.OS === 'ios' ? 70 : 90}
        onLongPress={disabled ? undefined : onLongPress}
        onPressIn={disabled ? undefined : handlePressIn}
        onPressOut={disabled ? undefined : handlePressOut}
        style={style}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole={accessibilityRole}
        accessibilityState={accessibilityState}
        accessibilityHint={accessibilityHint}
        hitSlop={hitSlop}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
