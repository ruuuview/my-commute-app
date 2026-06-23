import React, { useEffect } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';

interface StatusBezelProps {
  statusType: 'good' | 'minor' | 'severe' | 'suspended' | 'closure' | 'loading' | 'error' | string;
  style?: StyleProp<ViewStyle>;
}

export const StatusBezel: React.FC<StatusBezelProps> = React.memo(({ statusType, style }) => {
  const pulse = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  const normalizedStatus = statusType.toLowerCase();

  useEffect(() => {
    if (reducedMotion) {
      pulse.value = 1;
      return;
    }

    const shouldBlink =
      normalizedStatus.includes('suspended') ||
      normalizedStatus.includes('suspend') ||
      normalizedStatus.includes('closure') ||
      normalizedStatus.includes('closed');
    if (shouldBlink) {
      pulse.value = 1;
      pulse.value = withRepeat(
        withTiming(0.2, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      pulse.value = 1;
    }
  }, [normalizedStatus, reducedMotion, pulse]);

  const animatedStyle = useAnimatedStyle(() => {
    return { opacity: pulse.value };
  });

  let color = '#636366'; // Default suspended/closure/error/loading color
  if (normalizedStatus.includes('good')) {
    color = '#30D158';
  } else if (normalizedStatus.includes('minor') || normalizedStatus.includes('delay')) {
    if (normalizedStatus.includes('severe')) {
      color = '#FF3B30';
    } else {
      color = '#FF9F0A';
    }
  } else if (normalizedStatus.includes('severe')) {
    color = '#FF3B30';
  } else if (
    normalizedStatus.includes('suspended') ||
    normalizedStatus.includes('suspend') ||
    normalizedStatus.includes('closure') ||
    normalizedStatus.includes('closed')
  ) {
    color = '#FF3B30';
  }

  return (
    <View style={[styles.outerBezel, style]}>
      <Animated.View style={[styles.innerLens, { backgroundColor: color }, animatedStyle]} />
    </View>
  );
});

StatusBezel.displayName = 'StatusBezel';

const styles = StyleSheet.create({
  outerBezel: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerLens: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
