// components/ProgressDots.tsx
import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

interface Props {
  currentStep: number; // 0-indexed
  totalSteps: number;
  style?: ViewStyle;
}

function ProgressDot({ isActive }: { isActive: boolean }) {
  const animatedStyle = useAnimatedStyle(() => {
    const width = withSpring(isActive ? 20 : 8, { damping: 14, stiffness: 180 });
    const backgroundColor = withSpring(
      isActive ? 'rgba(255, 255, 255, 0.90)' : 'rgba(255, 255, 255, 0.25)',
      { damping: 14, stiffness: 180 }
    );
    return {
      width,
      backgroundColor,
    };
  });

  return <Animated.View style={[styles.dot, animatedStyle]} />;
}

export default function ProgressDots({ currentStep, totalSteps, style }: Props) {
  return (
    <View
      style={[styles.container, style]}
      accessibilityLabel={`Step ${currentStep + 1} of ${totalSteps}`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: totalSteps - 1, now: currentStep }}
    >
      <View style={styles.dotsRow}>
        {Array.from({ length: totalSteps }, (_, i) => (
          <ProgressDot key={i} isActive={i === currentStep} />
        ))}
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
    gap: 6, // Gap: 6px
  },
  dot: {
    height: 3, // height 3px
    borderRadius: 1.5, // pill shape
  },
});


