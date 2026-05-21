// components/BouncyPressable.tsx
// Universal tappable wrapper for every interactive element in the app.
// Spring physics: snappy compression on press-in, bouncy release on press-out.
// Every pill, button, card, and station row uses this — no raw Pressable/TouchableOpacity.

import React from 'react';
import { Pressable, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

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

  const springStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.94, { damping: 15, stiffness: 400 });
    onPressIn?.();
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 12, stiffness: 300 });
    onPressOut?.();
  };

  return (
    <Animated.View style={[springStyle, animatedStyle]}>
      <Pressable
        onPress={disabled ? undefined : onPress}
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
