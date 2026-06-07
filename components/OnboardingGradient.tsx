import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export function OnboardingGradient() {
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {/* Base deep navy to dark navy vertical gradient */}
      <LinearGradient
        colors={['#07103a', '#040810']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Cobalt radial-like bloom from top-left */}
      <LinearGradient
        colors={['rgba(0, 80, 255, 0.18)', 'rgba(0, 80, 255, 0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.8, y: 0.8 }}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Violet radial-like bloom from top-right */}
      <LinearGradient
        colors={['rgba(139, 92, 246, 0.15)', 'rgba(139, 92, 246, 0)']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.2, y: 0.8 }}
        style={StyleSheet.absoluteFillObject}
      />
    </View>
  );
}

