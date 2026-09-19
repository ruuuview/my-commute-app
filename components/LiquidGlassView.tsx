// components/LiquidGlassView.tsx
import React, { memo } from 'react';
import { StyleSheet, View, ViewStyle, StyleProp, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassView, isLiquidGlassAvailable, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { GLASS } from '../theme/colors';
import { useReduceTransparency } from '../hooks/useReduceTransparency';

// Dynamic safe resolution of expo-glass-effect (iOS 18+ Liquid Glass)
let isNativeGlassAvailable = false;
try {
  if (Platform.OS === 'ios' && typeof isLiquidGlassAvailable === 'function') {
    isNativeGlassAvailable =
      isLiquidGlassAvailable() &&
      (typeof isGlassEffectAPIAvailable !== 'function' || isGlassEffectAPIAvailable());
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
  tint?: 'dark' | 'light' | 'default' | 'systemMaterial' | 'systemThinMaterial' | string;
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
  tint = GLASS.blurTint,
  specular = true,
  borderTopColor,
  borderColor = GLASS.borderColor,
  testID,
}: LiquidGlassViewProps) {
  const reduceTransparency = useReduceTransparency();
  const effectiveBorderColor = reduceTransparency
    ? 'rgba(255, 255, 255, 0.20)'
    : (borderColor || GLASS.borderColor);

  return (
    <View style={[styles.outerShadowContainer, style]} testID={testID}>
      <View
        style={[
          styles.innerGlassBody,
          {
            borderRadius,
            backgroundColor: reduceTransparency
              ? '#1C1C1E'
              : GLASS.background,
            borderColor: reduceTransparency
              ? 'rgba(255, 255, 255, 0.20)'
              : (borderColor || GLASS.borderColor),
            borderTopColor: reduceTransparency
              ? 'rgba(255, 255, 255, 0.20)'
              : (borderTopColor || GLASS.borderTop),
            borderBottomColor: reduceTransparency
              ? 'rgba(255, 255, 255, 0.20)'
              : GLASS.borderBottom,
          },
          contentStyle,
        ]}
      >
        {/* Layer 1: Native Glass Effect (Liquid Glass when compiled) */}
        {!reduceTransparency && (Platform.OS === 'ios' || Platform.OS === 'web') && (
          isNativeGlassAvailable ? (
            <GlassView
              glassEffectStyle="regular"
              colorScheme="dark"
              pointerEvents="none"
              style={StyleSheet.absoluteFillObject}
            />
          ) : null
        )}

        {/* Layer 2: Physical specular top sheen (simulates light refraction across curved glass) */}
        {specular && !reduceTransparency && (
          <LinearGradient
            colors={[GLASS.specularStart, GLASS.specularEnd]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 20,
              borderTopLeftRadius: borderRadius,
              borderTopRightRadius: borderRadius,
            }}
            pointerEvents="none"
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
    borderColor: GLASS.borderColor,
  },
});
