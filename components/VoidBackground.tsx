// components/VoidBackground.tsx
// Ambient gradient for The Foyer. 'unknown' state now uses deep void (#1A1A2E)
// instead of flat black — gradient always has visible depth, even before lines selected.

import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, AccessibilityInfo, Image } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { useLineDataStore } from '../store/lineDataStore';
import { useWorstStatus, StatusLevel } from '../hooks/useWorstStatus';

// Gradients: visible on device, dark enough to preserve white text contrast.
// 'unknown' = deep void blue — perceptibly different from black, never flat.
const GRADIENTS: Record<StatusLevel, readonly [string, string]> = {
  good:      ['#0A4A2A', '#051A0A'],   // Deep forest green
  minor:     ['#6B3200', '#2A1200'],   // Dark amber
  severe:    ['#5C0A0A', '#200000'],   // Deep ember
  suspended: ['#3D0000', '#160000'],   // Void crimson
  unknown:   ['#1A1A2E', '#0D1117'],   // Deep void blue — never flat black
} as const;

// Root backgroundColor matches unknown[0] — zero black bleed-through on mount
export const VOID_ROOT_COLOR = '#1A1A2E';

export default function VoidBackground() {
  const selectedLines = useUserPreferencesStore(s => s.selectedLines);
  const hasStatusData = useLineDataStore(s => Object.keys(s.lines).length > 0);
  const status        = useWorstStatus(hasStatusData ? selectedLines : []);

  const prevRef  = useRef<StatusLevel>('unknown');
  const opacity  = useSharedValue(0);
  const [layers, setLayers] = useState<[StatusLevel, StatusLevel]>(['unknown', 'unknown']);

  useEffect(() => {
    if (status === prevRef.current) return;
    AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      setLayers([prevRef.current, status]);
      opacity.value = 0;
      if (reduced) {
        opacity.value = 1;
        runOnJS(setLayers)([status, status]);
        opacity.value = 0;
        prevRef.current = status;
      } else {
        opacity.value = withTiming(1, { duration: 600 }, finished => {
          if (finished) {
            runOnJS(setLayers)([status, status]);
            opacity.value = 0;
            prevRef.current = status;
          }
        });
      }
    });
  }, [status]);

  const topStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View
      style={StyleSheet.absoluteFillObject}
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden={true}
      importantForAccessibility="no-hide-descendants"
    >
      <LinearGradient
        colors={GRADIENTS[layers[0]]}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
      />
      <Animated.View style={[StyleSheet.absoluteFillObject, topStyle]}>
        <LinearGradient
          colors={GRADIENTS[layers[1]]}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        />
      </Animated.View>
      <Image
        source={require('../assets/images/grain.png')}
        style={[StyleSheet.absoluteFillObject, { opacity: 0.03 }]}
        resizeMode="repeat"
      />
    </View>
  );
}
