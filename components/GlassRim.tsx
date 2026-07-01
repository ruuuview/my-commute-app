// components/GlassRim.tsx
// Full-perimeter gradient border wrapper for glassmorphism cards.
// Replaces the old top-only rim with a LinearGradient border that
// is brightest at the top (0.35), medium on sides (0.10), dim at
// bottom (0.06) — matching how glass catches light from above.
//
// Usage:
//   <GlassRim borderRadius={14}>
//     <YourCardContent />
//   </GlassRim>

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GLASS } from '../theme/colors';

const HAIRLINE = StyleSheet.hairlineWidth;

interface GlassRimProps {
  children: React.ReactNode;
  /** Base border radius for all corners (required). Must match the
   *  card's existing outer borderRadius exactly. */
  borderRadius: number;
  /** Optional extra style applied to the outer gradient container.
   *  Use for per-corner radius overrides, e.g.
   *  { borderTopLeftRadius: 28, borderTopRightRadius: 28 } */
  containerStyle?: object;
}

export function GlassRim({ children, borderRadius, containerStyle }: GlassRimProps) {
  const innerRadius = Math.max(borderRadius - HAIRLINE, 0);

  return (
    <LinearGradient
      colors={[
        'rgba(255,255,255,0.35)',  // top — bright
        'rgba(255,255,255,0.10)',  // sides — medium
        'rgba(255,255,255,0.06)',  // bottom — dim
      ]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[
        styles.container,
        { borderRadius },
        containerStyle,
      ]}
    >
      <View
        style={[
          styles.inner,
          { borderRadius: innerRadius, backgroundColor: GLASS.background },
        ]}
      >
        {children}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: HAIRLINE,
    overflow: 'hidden',
  },
  inner: {
    flex: 1,
    overflow: 'hidden',
  },
});
