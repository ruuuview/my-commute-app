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
import { StyleSheet, View, AccessibilityInfo } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useWorstStatus, StatusLevel } from '../hooks/useWorstStatus';

// ─── Gradient palette (v4.1 §1.1 + §2.4) ─────────────────────────────────────
// Top colour shifts with traffic-light status.
// Bottom colour provides the refractive ice base for glass cards.
const STATUS_GRADIENTS: Record<StatusLevel, readonly [string, string]> = {
  good:      ['#0A2E1A', '#F0FFF4'],  // Deep Forest  → Pale Mint
  minor:     ['#7C3A00', '#FFF8E8'],  // Deep Amber   → Warm Cream
  severe:    ['#5C0A0A', '#FFF0F0'],  // Deep Ember   → Pale Rose
  suspended: ['#3D0000', '#FFE8E8'],  // Void Crimson → Blush
  unknown:   ['#1A1A2E', '#F0F4FF'],  // Deep Void    → Pale Ice (default / offline)
} as const;

// ─── Component ─────────────────────────────────────────────────────────────────
interface Props {
  /** TfL line IDs to evaluate — pass selectedLines from Zustand */
  lines: string[];
  children?: React.ReactNode;
}

export function GradientBackground({ lines, children }: Props) {
  const status = useWorstStatus(lines);
  const prevStatusRef = useRef<StatusLevel>('unknown');
  const crossfadeOpacity = useSharedValue(0);

  // [bottom layer (outgoing), top layer (incoming)]
  const [layers, setLayers] = useState<[StatusLevel, StatusLevel]>(['unknown', 'unknown']);

  useEffect(() => {
    if (status === prevStatusRef.current) return;

    // Respect system Reduce Motion setting — snap instead of animate
    AccessibilityInfo.isReduceMotionEnabled().then(reduceMotion => {
      const newLayers: [StatusLevel, StatusLevel] = [prevStatusRef.current, status];
      setLayers(newLayers);
      crossfadeOpacity.value = 0;

      if (reduceMotion) {
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
    });
  }, [status]);

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
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />

      {/* Top layer — incoming gradient, cross-fades in over 800ms */}
      <Animated.View style={[StyleSheet.absoluteFillObject, topLayerStyle]}>
        <LinearGradient
          colors={STATUS_GRADIENTS[layers[1]]}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        />
      </Animated.View>

      {children}
    </View>
  );
}

export default GradientBackground;
