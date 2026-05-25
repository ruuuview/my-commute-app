// components/ProgressDots.tsx
import React from 'react';
import { View, ViewStyle } from 'react-native';

interface Props {
  currentStep: number; // 0-indexed
  totalSteps: number;
  style?: ViewStyle;
}

export default function ProgressDots({ currentStep, totalSteps, style }: Props) {
  return (
    <View
      style={[{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingBottom: 12 }, style]}
      accessibilityLabel={`Step ${currentStep + 1} of ${totalSteps}`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: totalSteps - 1, now: currentStep }}
    >
      {Array.from({ length: totalSteps }, (_, i) => (
        <View
          key={`progress-dot-${i.toString()}`}
          accessibilityElementsHidden={true}
          importantForAccessibility="no-hide-descendants"
          style={{
            width: i === currentStep ? 24 : 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: i === currentStep
              ? 'rgba(255,255,255,0.95)'
              : 'rgba(255,255,255,0.30)',
          }}
        />
      ))}
    </View>
  );
}
