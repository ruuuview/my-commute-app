/**
 * LivingDot - Expanding field wave pulsation
 * * Inspired by the Emergent "Agent is running..." indicator.
 * Core solid dot + multiple concentric rings that radiate outward
 * like ripples in water, each fading as it expands.
 * * Architecture:
 * - Layer 0: Core dot (gentle breathing scale, stays solid)
 * - Layer 1: Ring wave 1 (expands outward, fades to transparent)
 * - Layer 2: Ring wave 2 (same, staggered by half-cycle)
 * - Creates continuous overlapping ripple field effect
 */
import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Easing } from 'react-native';

interface LivingDotProps {
  color: string;
  size?: number;
}

const CYCLE_DURATION = 1800; // ms for one full ripple expansion
const MAX_RING_SCALE = 2.8;  // How far rings expand (relative to dot)

const LivingDot: React.FC<LivingDotProps> = ({ color, size = 10 }) => {
  // Core dot breathing
  const dotScale = useRef(new Animated.Value(1)).current;

  // Ring wave 1
  const ring1Scale = useRef(new Animated.Value(1)).current;
  const ring1Opacity = useRef(new Animated.Value(0.45)).current;

  // Ring wave 2 (staggered)
  const ring2Scale = useRef(new Animated.Value(1)).current;
  const ring2Opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    // === CORE DOT: gentle breathing ===
    const dotBreathing = Animated.loop(
      Animated.sequence([
        Animated.timing(dotScale, {
          toValue: 1.15,
          duration: CYCLE_DURATION / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(dotScale, {
          toValue: 0.95,
          duration: CYCLE_DURATION / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    // === RING WAVE: expand outward + fade ===
    const createRingAnimation = (
      scale: Animated.Value,
      opacity: Animated.Value
    ) =>
      Animated.loop(
        Animated.sequence([
          // Reset to center
          Animated.parallel([
            Animated.timing(scale, {
              toValue: 1,
              duration: 0,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0.45,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
          // Expand outward while fading
          Animated.parallel([
            Animated.timing(scale, {
              toValue: MAX_RING_SCALE,
              duration: CYCLE_DURATION,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: CYCLE_DURATION,
              easing: Easing.in(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
        ])
      );

    // Start animations
    dotBreathing.start();
    createRingAnimation(ring1Scale, ring1Opacity).start();

    // Stagger ring 2 by half cycle
    const staggerTimer = setTimeout(() => {
      createRingAnimation(ring2Scale, ring2Opacity).start();
    }, CYCLE_DURATION / 2);

    return () => {
      dotBreathing.stop();
      clearTimeout(staggerTimer);
    };
  }, []);

  const ringSize = size * 3;

  return (
    <View style={[styles.container, { width: ringSize, height: ringSize }]}>
      {/* Ring wave 2 (behind ring 1) */}
      <Animated.View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: color,
            transform: [{ scale: ring2Scale }],
            opacity: ring2Opacity,
          },
        ]}
      />

      {/* Ring wave 1 */}
      <Animated.View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: color,
            transform: [{ scale: ring1Scale }],
            opacity: ring1Opacity,
          },
        ]}
      />

      {/* Core dot - stays solid, gentle breathing */}
      <Animated.View
        style={[
          styles.coreDot,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            transform: [{ scale: dotScale }],
            shadowColor: color,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  coreDot: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 3,
  },
});

export default LivingDot;