import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MASTER_CANVAS } from '../theme/colors';

export function OnboardingGradient() {
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {/* Vault / Settings unified deep dark gradient */}
      <LinearGradient
        colors={MASTER_CANVAS.VAULT_SETTINGS_GRADIENT}
        locations={[0, 0.50, 1.0]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
    </View>
  );
}
