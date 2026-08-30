// components/LiquidGlassView.tsx
import React, { memo } from 'react';
import { StyleSheet, View, ViewStyle, StyleProp, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { GLASS } from '../theme/colors';

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
 * LiquidGlassView (Apple Liquid Glass 2-Tier Architecture)
 * ────────────────────────────────────────────────────────
 * Outer Container: Handles unclipped ambient drop shadow.
 * Inner Glass Body: Handles clipping, native BlurView,
 * specular catch-light LinearGradient, and directional rim borders.
 */
export const LiquidGlassView = memo(function LiquidGlassView({
  children,
  style,
  contentStyle,
  borderRadius = 14,
  intensity = GLASS.blurIntensity,
  tint = 'dark',
  specular = true,
  borderTopColor = GLASS.borderTop,
  borderColor = GLASS.borderSides,
  testID,
}: LiquidGlassViewProps) {
  return (
    <View style={[styles.outerShadowContainer, style]} testID={testID}>
      <View
        style={[
          styles.innerGlassBody,
          {
            borderRadius,
            backgroundColor: Platform.OS === 'android' ? '#0E0E14' : GLASS.background,
            borderTopColor,
            borderBottomColor: GLASS.borderBottom,
            borderLeftColor: borderColor,
            borderRightColor: borderColor,
          },
          contentStyle,
        ]}
      >
        {/* Layer 1: Native Live Blur */}
        {Platform.OS === 'ios' && (
          <BlurView
            intensity={intensity}
            tint={tint}
            style={StyleSheet.absoluteFillObject}
          />
        )}

        {/* Layer 2: Specular Highlight Catch-Light */}
        {specular && (
          <LinearGradient
            colors={[GLASS.specularStart, GLASS.specularEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.45, y: 0.45 }}
            pointerEvents="none"
            style={StyleSheet.absoluteFillObject}
          />
        )}

        {/* Layer 3: Content */}
        {children}
      </View>
    </View>
  );
});

LiquidGlassView.displayName = 'LiquidGlassView';
export default LiquidGlassView;

const styles = StyleSheet.create({
  outerShadowContainer: {
    backgroundColor: 'transparent',
    shadowColor: GLASS.shadowColor,
    shadowOffset: GLASS.shadowOffset,
    shadowOpacity: GLASS.shadowOpacity,
    shadowRadius: GLASS.shadowRadius,
    elevation: 4,
  },
  innerGlassBody: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
