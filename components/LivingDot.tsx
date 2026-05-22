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
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';

interface LivingDotProps {
  color: string;
  size?: number;
}

const CYCLE_DURATION = 1800; // ms for one full ripple expansion
const MAX_RING_SCALE = 2.8;  // How far rings expand (relative to dot)

const LivingDot: React.FC<LivingDotProps> = ({ color, size = 10 }) => {
  const dotScale = useSharedValue(1);
  const ring1Scale = useSharedValue(1);
  const ring1Opacity = useSharedValue(0.45);
  const ring2Scale = useSharedValue(1);
  const ring2Opacity = useSharedValue(0);

  useEffect(() => {
    // === CORE DOT: gentle breathing ===
    dotScale.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: CYCLE_DURATION / 2, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.95, { duration: CYCLE_DURATION / 2, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true // reverse
    );

    // === RING WAVE 1 ===
    ring1Scale.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 0 }),
        withTiming(MAX_RING_SCALE, { duration: CYCLE_DURATION, easing: Easing.out(Easing.ease) })
      ),
      -1,
      false
    );
    
    ring1Opacity.value = withRepeat(
      withSequence(
        withTiming(0.45, { duration: 0 }),
        withTiming(0, { duration: CYCLE_DURATION, easing: Easing.in(Easing.ease) })
      ),
      -1,
      false
    );

    // === RING WAVE 2 (staggered) ===
    ring2Scale.value = withDelay(
      CYCLE_DURATION / 2,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 0 }),
          withTiming(MAX_RING_SCALE, { duration: CYCLE_DURATION, easing: Easing.out(Easing.ease) })
        ),
        -1,
        false
      )
    );

    ring2Opacity.value = withDelay(
      CYCLE_DURATION / 2,
      withRepeat(
        withSequence(
          withTiming(0.45, { duration: 0 }),
          withTiming(0, { duration: CYCLE_DURATION, easing: Easing.in(Easing.ease) })
        ),
        -1,
        false
      )
    );
  }, []);

  const ring1Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring1Scale.value }],
    opacity: ring1Opacity.value,
  }));

  const ring2Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring2Scale.value }],
    opacity: ring2Opacity.value,
  }));

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dotScale.value }],
  }));

  const ringSize = size * 3;

  return (
    <View style={[styles.container, { width: ringSize, height: ringSize }]}>
      {/* Ring wave 2 (behind ring 1) */}
      <Animated.View
        style={[
          styles.ring,
          ring2Style,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: color,
          },
        ]}
      />

      {/* Ring wave 1 */}
      <Animated.View
        style={[
          styles.ring,
          ring1Style,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: color,
          },
        ]}
      />

      {/* Core dot */}
      <Animated.View
        style={[
          styles.coreDot,
          dotStyle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            boxShadow: `0px 0px 4px ${color}`,
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
  },
});

export default LivingDot;