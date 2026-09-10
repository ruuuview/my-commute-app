import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ONBOARDING_RADAR_GRADIENT } from '../theme/colors';

export function OnboardingGradient() {
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {/* 1. Primary luminous royal sapphire vertical flow */}
      <LinearGradient
        colors={ONBOARDING_RADAR_GRADIENT.colors}
        locations={ONBOARDING_RADAR_GRADIENT.locations}
        start={ONBOARDING_RADAR_GRADIENT.start}
        end={ONBOARDING_RADAR_GRADIENT.end}
        style={StyleSheet.absoluteFillObject}
      />
      {/* 2. Top-centered atmospheric sapphire optical bloom for specular glass card refraction */}
      <LinearGradient
        colors={['rgba(0, 102, 204, 0.24)', 'rgba(0, 51, 128, 0.08)', 'transparent']}
        locations={[0, 0.45, 0.90]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.70 }}
        style={StyleSheet.absoluteFillObject}
      />
    </View>
  );
}
