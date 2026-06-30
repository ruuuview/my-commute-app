// components/GlassRim.tsx
// Top-highlight rim for glassmorphism cards — a 1px bright line
// at the top edge creating a premium glass edge highlight.
// Rounds with the parent's border radius via the layering effect
// of overflow: 'hidden' (which BlurView provides naturally).

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { GLASS } from '../theme/colors';

interface GlassRimProps {
  /** Height / line width of the glow */
  height?: number;
  /** borderRadius for corners — pass the parent card's borderRadius */
  borderRadius?: number;
  /** Offset from top to overlay exactly on the card's top border */
  top?: number;
  /** Left/right inset to match card padding */
  inset?: number;
}

export function GlassRim({
  height = 1,
  borderRadius = 14,
  top = 0,
  inset = 0,
}: GlassRimProps) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.rim,
        {
          top,
          left: inset,
          right: inset,
          height,
          borderRadius: Math.max(borderRadius, 0),
        },
      ]}
    />
  );
}

/** Static style — dynamic props set inline above */
const styles = StyleSheet.create({
  rim: {
    position: 'absolute',
    backgroundColor: GLASS.borderTop,
  },
});
