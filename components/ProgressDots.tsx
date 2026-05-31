// components/ProgressDots.tsx
import React, { useEffect } from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

interface Props {
  currentStep: number; // 0-indexed
  totalSteps: number;
  style?: ViewStyle;
}

const DOT_SIZE = 8;
const GAP = 8;
const ACTIVE_WIDTH = 24;

export default function ProgressDots({ currentStep, totalSteps, style }: Props) {
  const activeIndex = useSharedValue(currentStep);

  useEffect(() => {
    activeIndex.value = withSpring(currentStep, { damping: 18, stiffness: 160 });
  }, [currentStep, activeIndex]);

  const activeStyle = useAnimatedStyle(() => {
    const stepDistance = DOT_SIZE + GAP;
    // Align active pill center (12px) with static dot center (4px)
    // Static dot center = activeIndex * stepDistance + 4
    // Active pill center = translateX + 12
    // translateX = activeIndex * stepDistance - 8
    const translateX = activeIndex.value * stepDistance - 8;
    return {
      transform: [{ translateX }],
    };
  });

  return (
    <View
      style={[styles.container, style]}
      accessibilityLabel={`Step ${currentStep + 1} of ${totalSteps}`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: totalSteps - 1, now: currentStep }}
    >
      <View style={styles.dotsRow}>
        {/* Background static dots */}
        {Array.from({ length: totalSteps }, (_, i) => (
          <View key={i} style={styles.staticDot} />
        ))}

        {/* Sliding active overlay dot */}
        <Animated.View style={[styles.activePill, activeStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 12,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    gap: GAP,
  },
  staticDot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  activePill: {
    position: 'absolute',
    left: 0,
    width: ACTIVE_WIDTH,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: '#FFFFFF',
  },
});

