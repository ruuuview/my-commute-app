import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ONBOARDING_RADAR_GRADIENT, SAPPHIRE_ATMOSPHERIC_BLOOM } from '../theme/colors';

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
        colors={SAPPHIRE_ATMOSPHERIC_BLOOM.colors}
        locations={SAPPHIRE_ATMOSPHERIC_BLOOM.locations}
        start={SAPPHIRE_ATMOSPHERIC_BLOOM.start}
        end={SAPPHIRE_ATMOSPHERIC_BLOOM.end}
        style={StyleSheet.absoluteFillObject}
      />
    </View>
  );
}
