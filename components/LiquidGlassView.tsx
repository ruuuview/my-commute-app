// components/LiquidGlassView.tsx
import React, { memo } from 'react';
import { StyleSheet, View, ViewStyle, StyleProp, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { GLASS } from '../theme/colors';
import { useReduceTransparency } from '../hooks/useReduceTransparency';

// Dynamic safe resolution of expo-glass-effect (iOS 18+ Liquid Glass)
let isNativeGlassAvailable = false;
try {
  if (Platform.OS === 'ios' && typeof isLiquidGlassAvailable === 'function') {
    isNativeGlassAvailable = isLiquidGlassAvailable();
  }
} catch {
  isNativeGlassAvailable = false;
}

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
 * Layer 0: Ambient soft drop shadow (unclipped).
 * Layer 1: Hardware native GlassView (iOS 18+ Liquid Glass) or
 *          native BlurView (iOS 16/17 & Web).
 * Layer 2: Physical specular catch-light reflection sheen.
 * Layer 3: Glass card content.
 *
 * Accessibility:
 * Automatically listens to `useReduceTransparency()`. When user has
 * Reduce Transparency enabled in iOS Settings, all blur/glass effects
 * are omitted and a solid, opaque dark slate (#1C1C1E) is rendered.
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
        {/* Layer 1: Native Glass Effect (Liquid Glass when compiled, BlurView fallback) */}
        {!reduceTransparency && (Platform.OS === 'ios' || Platform.OS === 'web') && (
          isNativeGlassAvailable ? (
            <GlassView
              glassEffectStyle="regular"
              colorScheme="dark"
              style={StyleSheet.absoluteFillObject}
            />
          ) : (
            <BlurView
              intensity={intensity}
              tint={tint}
              style={StyleSheet.absoluteFillObject}
            />
          )
        )}

        {/* Layer 2: Specular Top Rim Catch-Light (Physical Glass Highlight) */}
        {specular && !reduceTransparency && (
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
    shadowColor: GLASS.shadowColor,
    shadowOffset: GLASS.shadowOffset,
    shadowOpacity: GLASS.shadowOpacity,
    shadowRadius: GLASS.shadowRadius,
    elevation: GLASS.elevation,
  },
  innerGlassBody: {
    overflow: 'hidden',
    borderWidth: GLASS.borderWidth,
  },
  specularTopSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 22,
  },
});
