import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ONBOARDING_GRADIENT } from '../theme/colors';

export function OnboardingGradient() {
  return (
    <LinearGradient
      colors={ONBOARDING_GRADIENT.colors}
      locations={ONBOARDING_GRADIENT.locations}
      start={ONBOARDING_GRADIENT.start}
      end={ONBOARDING_GRADIENT.end}
      style={StyleSheet.absoluteFillObject}
      pointerEvents="none"
    />
  );
}
