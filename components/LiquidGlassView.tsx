// components/LiquidGlassView.tsx
import React, { memo } from 'react';
import { StyleSheet, View, ViewStyle, StyleProp, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { GLASS } from '../theme/colors';

import { useReduceTransparency } from '../hooks/useReduceTransparency';

export interface LiquidGlassViewProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  borderRadius?: number;
  intensity?: number;
  tint?: 'dark' | 'light' | 'default';
  specular?: boolean;
  borderTopColor?: string;
  borderColor?: string;
  testID?: string;
}

/**
 * LiquidGlassView / GlassSurface
 * ────────────────────────────────────────────────────────
 * Outer Container: Handles unclipped ambient drop shadow.
 * Inner Glass Body: Handles clipping, native BlurView,
 * specular catch-light LinearGradient, and directional rim borders.
 *
 * Accessibility:
 * Automatically listens to `useReduceTransparency()`. When user has
 * Reduce Transparency enabled in iOS Settings, BlurView is omitted
 * and a solid, opaque high-contrast dark slate (#1C1C1E) is rendered.
 */
export const LiquidGlassView = memo(function LiquidGlassView({
  children,
  style,
  contentStyle,
  borderRadius = 16,
  intensity = GLASS.blurIntensity,
  tint = 'dark',
  specular = true,
  borderColor = GLASS.borderColor,
  testID,
}: LiquidGlassViewProps) {
  const reduceTransparency = useReduceTransparency();

  return (
    <View style={[styles.outerShadowContainer, style]} testID={testID}>
      <View
        style={[
          styles.innerGlassBody,
          {
            borderRadius,
            backgroundColor: reduceTransparency
              ? '#1C1C1E'
              : Platform.OS === 'android'
              ? '#0E0E14'
              : GLASS.background,
            borderColor: reduceTransparency ? 'rgba(255, 255, 255, 0.20)' : borderColor,
          },
          contentStyle,
        ]}
      >
        {/* Layer 1: Native Live Blur (iOS & Web) — skipped under Reduce Transparency */}
        {!reduceTransparency && (Platform.OS === 'ios' || Platform.OS === 'web') && (
          <BlurView
            intensity={intensity}
            tint={tint}
            style={StyleSheet.absoluteFillObject}
          />
        )}

        {/* Layer 2: Specular Top Rim Catch-Light (Physical Glass Reflection) */}
        {specular && (
          <LinearGradient
            colors={[GLASS.specularStart, GLASS.specularEnd]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            pointerEvents="none"
            style={styles.specularTopSheen}
          />
        )}

        {/* Layer 3: Content */}
        {children}
      </View>
    </View>
  );
});

LiquidGlassView.displayName = 'LiquidGlassView';
export const GlassSurface = LiquidGlassView;
export default LiquidGlassView;

const styles = StyleSheet.create({
  outerShadowContainer: {
    backgroundColor: 'transparent',
  },
  innerGlassBody: {
    overflow: 'hidden',
    borderWidth: 1.25,
  },
  specularTopSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 18,
  },
});
