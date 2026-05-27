import React, { ReactNode } from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

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

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function handlePressIn() {
    scale.value = withSpring(pressScale, { damping: 12, stiffness: 180 });
  }

  function handlePressOut() {
    if (overshoot) {
      scale.value = withSpring(1.08, { damping: 8, stiffness: 200 });
      setTimeout(() => {
        scale.value = withSpring(1.0, { damping: 10, stiffness: 160 });
      }, 80);
    } else {
      scale.value = withSpring(1.0, { damping: 10, stiffness: 160 });
    }
  }

  return (
    <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={onPress} {...rest}>
      <Animated.View style={[animStyle, style]}>{children}</Animated.View>
    </Pressable>
  );
}
