import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export function OnboardingGradient() {
  return (
    <LinearGradient
      colors={[
        '#0044EE',   // 0%   — electric blue crown
        '#002299',   // 22%  — deep navy
        '#001166',   // 38%  — ink
        '#0a0d3a',   // 48%  — transition node
        '#b8c0f0',   // 58%  — bloom haze
        '#ECEFFE',   // 80%  — pearl data zone
        '#ECEFFE',   // 100% — pearl lock
      ]}
      locations={[0, 0.22, 0.38, 0.48, 0.58, 0.80, 1.0]}
      style={StyleSheet.absoluteFillObject}
      pointerEvents="none"
    />
  );
}
