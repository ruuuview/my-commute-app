// components/GradientBackground.tsx
//
// The living root background for all app-interior screens (dashboard, status, settings).
// NEVER used in onboarding — those screens use VoidBackground.
//
// Architecture: Two stacked LinearGradient layers animated via opacity cross-fade.
// Reanimated cannot interpolate hex strings — we animate the TOP layer's opacity
// from 0 → 1 over 800ms, then snap both layers to the new status and reset opacity.
//
// Accessibility: purely decorative, pointerEvents="none", accessibilityElementsHidden.
// Status information is ALSO conveyed by text + icons on cards — never colour alone.

import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  useReducedMotion,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useWorstStatus, StatusLevel } from '../hooks/useWorstStatus';

// ─── Gradient palette (v4.6 overhaul) ─────────────────────────────────────────
// Top color shifts with traffic-light status, bleeding elegantly down into the UNIFIED_DARK_GRADIENT pitch-black base.
const STATUS_GRADIENTS: Record<StatusLevel, readonly [string, string, string, string]> = {
  good:      ['#1A6B3A', '#0A3D20', '#020307', '#000000'],
  minor:     ['#D4820A', '#7A4A00', '#020307', '#000000'],
  severe:    ['#C0392B', '#7B1A1A', '#020307', '#000000'],
  suspended: ['#8B0000', '#3A0000', '#020307', '#000000'],
  unknown:   ['#0A122C', '#060B1E', '#020307', '#000000'],
} as const;

const GRADIENT_LOCATIONS = [0, 0.42, 0.75, 1.0] as const;

// ─── Component ─────────────────────────────────────────────────────────────────
interface Props {
  /** TfL line IDs to evaluate — pass selectedLines from Zustand */
  lines?: string[];
  status?: StatusLevel;
  children?: React.ReactNode;
}

export function GradientBackground({ lines = [], status: overrideStatus, children }: Props) {
  const computedStatus = useWorstStatus(lines);
  const status = overrideStatus ?? computedStatus;
  const prevStatusRef = useRef<StatusLevel>('unknown');
  const crossfadeOpacity = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  // [bottom layer (outgoing), top layer (incoming)]
  const [layers, setLayers] = useState<[StatusLevel, StatusLevel]>(['unknown', 'unknown']);

  useEffect(() => {
    if (status === prevStatusRef.current) return;

    const newLayers: [StatusLevel, StatusLevel] = [prevStatusRef.current, status];
    setLayers(newLayers);
    crossfadeOpacity.value = 0;

    if (reducedMotion) {
      // Instant snap — still communicates the state change, just without motion
      crossfadeOpacity.value = 1;
      runOnJS(setLayers)([status, status]);
      crossfadeOpacity.value = 0;
      prevStatusRef.current = status;
    } else {
      // 800ms cross-fade per spec
      crossfadeOpacity.value = withTiming(1, { duration: 800 }, (finished) => {
        if (finished) {
          runOnJS(setLayers)([status, status]);
          crossfadeOpacity.value = 0;
          prevStatusRef.current = status;
        }
      });
    }
  }, [status, reducedMotion]);

  const topLayerStyle = useAnimatedStyle(() => ({
    opacity: crossfadeOpacity.value,
  }));

  return (
    <View
      style={StyleSheet.absoluteFillObject}
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden={true}
      importantForAccessibility="no-hide-descendants"
    >
      {/* Bottom layer — current / outgoing gradient */}
      <LinearGradient
        colors={STATUS_GRADIENTS[layers[0]]}
        style={StyleSheet.absoluteFillObject}
        locations={GRADIENT_LOCATIONS}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />

      {/* Top layer — incoming gradient, cross-fades in over 800ms */}
      <Animated.View style={[StyleSheet.absoluteFillObject, topLayerStyle]}>
        <LinearGradient
          colors={STATUS_GRADIENTS[layers[1]]}
          style={StyleSheet.absoluteFillObject}
          locations={GRADIENT_LOCATIONS}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        />
      </Animated.View>

      {children}
    </View>
  );
}

export default GradientBackground;
