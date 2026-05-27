// components/ProgressDots.tsx
import React, { useEffect } from 'react';
import { View, ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

interface Props {
  currentStep: number; // 0-indexed
  totalSteps: number;
  style?: ViewStyle;
}

const DOT_SIZE = 8;

export default function ProgressDots({ currentStep, totalSteps, style }: Props) {
  const activeIndex = useSharedValue(currentStep);

  useEffect(() => {
    activeIndex.value = withSpring(currentStep, { damping: 18, stiffness: 180 });
  }, [currentStep]);

  return (
    <View
      style={[{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingBottom: 12 }, style]}
      accessibilityLabel={`Step ${currentStep + 1} of ${totalSteps}`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: totalSteps - 1, now: currentStep }}
    >
      {Array.from({ length: totalSteps }, (_, i) => (
        <AnimatedDot key={i} index={i} activeIndex={activeIndex} />
      ))}
    </View>
  );
}

function AnimatedDot({ index, activeIndex }: { index: number; activeIndex: Animated.SharedValue<number> }) {
  const animatedStyle = useAnimatedStyle(() => {
    // Distance from this dot to the active index
    const dist = Math.abs(activeIndex.value - index);
    
    // Width interpolates from 24 (dist = 0) down to 8 (dist >= 1)
    const width = dist < 1 ? 8 + 16 * (1 - dist) : 8;
    
    // Opacity interpolates from 0.95 (dist = 0) to 0.30 (dist >= 1)
    const opacity = dist < 1 ? 0.30 + 0.65 * (1 - dist) : 0.30;
    
    return {
      width,
      opacity,
    };
  });

  return (
    <Animated.View
      style={[
        {
          height: DOT_SIZE,
          borderRadius: DOT_SIZE / 2,
          backgroundColor: '#FFFFFF',
        },
        animatedStyle,
      ]}
    />
  );
}
