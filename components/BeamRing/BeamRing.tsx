// components/BeamRing/BeamRing.tsx
// Boundary-only traveling beam ring. The Skia canvas draws ONLY the ring;
// the core stays fully transparent so the host card's own body (dark glass,
// solid white, …) shows through untouched. Mount as an absoluteFill-style
// overlay child of the card.
//
// The clock is a Reanimated shared value (0 -> 1 per revolution, repeating).
// Uniforms travel as ONE useDerivedValue<Uniforms> record: Skia only collects
// top-level shared values from the uniforms prop, so nesting shared values
// inside the record would silently corrupt uniform packing. The explicit
// <Uniforms> generic keeps tsc honest about the record shape.

import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import {
  Canvas,
  Fill,
  Shader,
  type Uniforms,
} from '@shopify/react-native-skia';
import { BEAM_RING_SKSOURCE, compileBeamRing } from './beamRing.sksl';
import {
  BASE_RIM,
  BEAM_ACCENT_DEFAULT,
  BEAM_DURATION_DEFAULT,
  BEAM_WIDTH_DEFAULT,
  BLOOM_RADIUS_DEFAULT,
  TAIL_TURNS_DEFAULT,
  clampedStrength,
  hexToLinearRgb,
  hexToRgba,
  isValidHex,
} from './beamPalettes';
import { useLiveReducedMotion } from '../../hooks/useReducedMotion';

export interface BeamRingProps {
  /** Corner radius in px — must match the host card's borderRadius. */
  cornerRadius: number;
  /** Beam intensity 0..1. Default 1. */
  strength?: number;
  /** Seconds per beam revolution. Default 2.4. */
  duration?: number;
  /** Play/pause the beam with a fade. Default true. */
  active?: boolean;
  /** Accent hex that tints the beam (severity states). Default iridescent blue. */
  accent?: string;
  /** Freeze to a static specular rim. Defaults to the OS Reduce Motion setting. */
  reducedMotion?: boolean;
  /** Optional shared value scaling canvas opacity (parent-driven fade). */
  progress?: SharedValue<number>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export default function BeamRing({
  cornerRadius,
  strength = 1,
  duration = BEAM_DURATION_DEFAULT,
  active = true,
  accent = BEAM_ACCENT_DEFAULT,
  reducedMotion,
  progress,
  style,
  testID = 'beam-ring',
}: BeamRingProps) {
  // Explicit prop wins; otherwise follow the OS accessibility setting.
  const systemReducedMotion = useLiveReducedMotion();
  const reduceMotion = reducedMotion ?? systemReducedMotion;
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((enabled) => {
        if (mounted) setReduceTransparency(enabled);
      })
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', (enabled) => {
      if (mounted) setReduceTransparency(enabled);
    });

    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const strength01 = clampedStrength(strength);
  const accentHex = isValidHex(accent) ? accent : BEAM_ACCENT_DEFAULT;
  const accentRgb = useMemo(() => hexToLinearRgb(accentHex), [accentHex]);
  const baseRimRgb = useMemo(() => hexToLinearRgb(BASE_RIM), []);

  // ---- animation drivers (UI thread; fed to the shader as uniforms) ----
  const clock = useSharedValue(0);
  const activeV = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    const d = duration > 0 ? duration : BEAM_DURATION_DEFAULT;
    clock.value = withRepeat(
      withTiming(1, { duration: d * 1000, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(clock);
  }, [clock, duration]);

  useEffect(() => {
    activeV.value = withTiming(active ? 1 : 0, { duration: 250 });
  }, [active, activeV]);

  // ---- shader ----
  const effect = useMemo(() => compileBeamRing(), []);
  void BEAM_RING_SKSOURCE;

  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const uniforms = useDerivedValue<Uniforms>(
    () => {
      'worklet';
      return {
        u_resolution: [size?.w ?? 0, size?.h ?? 0],
        u_time: clock.value,
        u_cornerRadius: cornerRadius,
        u_strength: strength01,
        u_active: activeV.value,
        u_accent: accentRgb,
        u_baseRim: baseRimRgb,
        u_beamWidth: BEAM_WIDTH_DEFAULT,
        u_tailTurns: TAIL_TURNS_DEFAULT,
        u_bloomRadius: BLOOM_RADIUS_DEFAULT,
        u_frozen: reduceMotion || reduceTransparency ? 1 : 0,
      };
    },
    [size, cornerRadius, strength01, accentRgb, baseRimRgb, reduceMotion, reduceTransparency],
  );

  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    return { opacity: progress ? progress.value : 1 };
  });

  return (
    <Animated.View
      style={[styles.fill, animatedStyle, style]}
      pointerEvents="none"
      testID={testID}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize((prev) =>
          prev && prev.w === width && prev.h === height ? prev : { w: width, h: height },
        );
      }}
    >
      {reduceTransparency || !effect ? (
        // Static accent fallback: renders under Reduce Transparency or if SkSL compilation is unavailable.
        <View
          testID={`${testID}-fallback`}
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: Math.max(cornerRadius, 0),
              borderWidth: BEAM_WIDTH_DEFAULT,
              borderColor: hexToRgba(accentHex, 0.55),
            },
          ]}
        />
      ) : size && effect ? (
        <Canvas style={StyleSheet.absoluteFill} testID={`${testID}-canvas`}>
          <Fill>
            <Shader source={effect} uniforms={uniforms} />
          </Fill>
        </Canvas>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
});
