// components/GradientBackground.tsx
//
// The living root background for all app-interior screens (dashboard, status, settings).
// NEVER used in onboarding — those screens use OnboardingGradient.
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
  withRepeat,
  Easing,
  runOnJS,
  useReducedMotion,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useWorstStatus, StatusLevel } from '../hooks/useWorstStatus';
import { DASHBOARD_OVERLAY_GRADIENT } from '../theme/colors';

// ─── Gradient palette (v4.6 overhaul) ─────────────────────────────────────────
// Top color shifts with traffic-light status, bleeding elegantly down into the UNIFIED_DARK_GRADIENT pitch-black base.
const STATUS_GRADIENTS: Record<StatusLevel, readonly [string, string, string, string]> = {
  good:      ['rgba(26, 107, 58, 0.45)', 'rgba(10, 61, 32, 0.15)', '#020307', '#000000'],
  minor:     ['rgba(212, 130, 10, 0.45)', 'rgba(122, 74, 0, 0.15)', '#020307', '#000000'],
  severe:    ['rgba(192, 57, 43, 0.45)', 'rgba(123, 26, 26, 0.15)', '#020307', '#000000'],
  suspended: ['rgba(139, 0, 0, 0.45)', 'rgba(58, 0, 0, 0.15)', '#020307', '#000000'],
  unknown:   ['rgba(0, 30, 107, 0.45)', 'rgba(0, 18, 69, 0.15)', '#020307', '#000000'],
} as const;

const GRADIENT_LOCATIONS = [0, 0.18, 0.45, 1.0] as const;

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

  const handleTransitionComplete = React.useCallback((resolvedStatus: StatusLevel) => {
    setLayers([resolvedStatus, resolvedStatus]);
    prevStatusRef.current = resolvedStatus;
  }, []);

  useEffect(() => {
    if (status === prevStatusRef.current) return;

    const newLayers: [StatusLevel, StatusLevel] = [prevStatusRef.current, status];
    setLayers(newLayers);
    crossfadeOpacity.value = 0;

    if (reducedMotion) {
      // Instant snap — still communicates the state change, just without motion
      crossfadeOpacity.value = 1;
      handleTransitionComplete(status);
      crossfadeOpacity.value = 0;
    } else {
      // 800ms cross-fade per spec
      crossfadeOpacity.value = withTiming(1, { duration: 800 }, (finished) => {
        if (finished) {
          runOnJS(handleTransitionComplete)(status);
          crossfadeOpacity.value = 0;
        }
      });
    }
  }, [status, reducedMotion, crossfadeOpacity, handleTransitionComplete]);

  const topLayerStyle = useAnimatedStyle(() => ({
    opacity: crossfadeOpacity.value,
  }));

  // Slow pulsing / breathing animation for the volumetric status light leak
  const breatheValue = useSharedValue(0.65);

  useEffect(() => {
    if (reducedMotion) {
      breatheValue.value = 0.75;
      return;
    }
    breatheValue.value = withRepeat(
      withTiming(0.85, {
        duration: 5000,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );
  }, [reducedMotion, breatheValue]);

  const breatheStyle = useAnimatedStyle(() => ({
    opacity: breatheValue.value,
  }));

  return (
    <View
      style={StyleSheet.absoluteFillObject}
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden={true}
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[StyleSheet.absoluteFillObject, breatheStyle]}>
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
      </Animated.View>

      {/* Universal Dashboard Edge Overlay */}
      <LinearGradient
        colors={DASHBOARD_OVERLAY_GRADIENT.colors}
        locations={DASHBOARD_OVERLAY_GRADIENT.locations}
        start={DASHBOARD_OVERLAY_GRADIENT.start}
        end={DASHBOARD_OVERLAY_GRADIENT.end}
        pointerEvents="none"
        style={StyleSheet.absoluteFillObject}
      />

      {children}
    </View>
  );
}

export default GradientBackground;
