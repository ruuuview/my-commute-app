/**
 * BouncyButton — Premium spring-physics pressable wrapper
 * Used across the entire app for tactile, iOS-native feel.
 * Haptic weight follows consequence: Light = info, Medium = navigation
 */
import React, { useRef, useCallback } from 'react';
import {
  TouchableOpacity,
  Animated,
  ViewStyle,
  StyleProp,
} from 'react-native';
import * as Haptics from 'expo-haptics';

interface BouncyButtonProps {
  onPress: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  disabled?: boolean;
  haptic?: 'light' | 'medium' | 'success' | 'warning' | 'none';
  scaleDown?: number;
}

const BouncyButton: React.FC<BouncyButtonProps> = ({
  onPress,
  onLongPress,
  style,
  children,
  disabled = false,
  haptic = 'light',
  scaleDown = 0.97,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: scaleDown,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  }, [scaleDown]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  }, []);

  const handlePress = useCallback(() => {
    if (disabled) return;

    switch (haptic) {
      case 'light':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case 'medium':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case 'success':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'warning':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case 'none':
        break;
    }

    onPress();
  }, [disabled, haptic, onPress]);

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      onLongPress={onLongPress}
      disabled={disabled}
    >
      <Animated.View
        style={[
          style,
          { transform: [{ scale: scaleAnim }] },
          disabled && { opacity: 0.5 },
        ]}
      >
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
};

export default BouncyButton;