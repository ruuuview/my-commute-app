import React, { ReactNode } from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, useReducedMotion } from 'react-native-reanimated';
import { PREMIUM_SPRING_CONFIG } from '../theme/physics';

interface SpringPressableProps extends Omit<PressableProps, 'children'> {
  pressScale?: number;
  overshoot?: boolean; // for + confirmation button
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

export function SpringPressable({
  pressScale = 0.96,
  overshoot = false,
  onPress,
  children,
  style,
  ...rest
}: SpringPressableProps) {
  const scale = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function handlePressIn() {
    if (reducedMotion) return;
    scale.value = withSpring(pressScale, PREMIUM_SPRING_CONFIG);
  }

  function handlePressOut() {
    if (reducedMotion) return;
    if (overshoot) {
      scale.value = withSpring(1.08, { ...PREMIUM_SPRING_CONFIG, damping: 8, stiffness: 200 });
      setTimeout(() => {
        scale.value = withSpring(1.0, PREMIUM_SPRING_CONFIG);
      }, 80);
    } else {
      scale.value = withSpring(1.0, PREMIUM_SPRING_CONFIG);
    }
  }

  return (
    <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={onPress} {...rest}>
      <Animated.View style={[animStyle, style]}>{children}</Animated.View>
    </Pressable>
  );
}
