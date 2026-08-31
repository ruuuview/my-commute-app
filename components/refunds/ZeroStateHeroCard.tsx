// components/refunds/ZeroStateHeroCard.tsx
// Radar v2 State A' hero — live surveillance radar card.
// ((•)) LIVE SURVEILLANCE + emerald "Checked Xm ago" capsule share one
// horizontal axis; £0.00 Active Delays headline below. Ring pulses on a slow
// loop (disabled under Reduce Motion).

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Broadcast } from 'phosphor-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import LivingDot from '../LivingDot';
import { formatRelativeTime } from '../../services/refundSlaService';
import { GLASS } from '../../theme/colors';

export default function ZeroStateHeroCard({
  checkedAtIso = null,
}: {
  checkedAtIso?: string | null;
}) {
  const reducedMotion = useReducedMotion();
  const [relativeTime, setRelativeTime] = useState(
    formatRelativeTime(checkedAtIso),
  );

  // Relative-time ticker (10s cadence mirrors the honest server cadence)
  useEffect(() => {
    setRelativeTime(formatRelativeTime(checkedAtIso));
    const interval = setInterval(() => {
      setRelativeTime(formatRelativeTime(checkedAtIso));
    }, 10000);
    return () => clearInterval(interval);
  }, [checkedAtIso]);

  // Slow breathing pulse on the surveillance ring
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) {
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 1600 }), -1, true);
  }, [pulse, reducedMotion]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.15 * pulse.value }],
    opacity: 1 - 0.25 * pulse.value,
  }));

  return (
    <View style={styles.outer}>
      <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
      <View style={styles.fill}>
        <View style={styles.topRow}>
          {/* LEFT: pulsing ring + LIVE SURVEILLANCE eyebrow */}
          <View style={styles.leftGroup}>
            <Animated.View style={[styles.pulsingRingContainer, ringStyle]}>
              <Broadcast size={24} color="#0098D4" weight="bold" />
            </Animated.View>
            <Text style={styles.eyebrow}>LIVE{'\n'}SURVEILLANCE</Text>
          </View>

          {/* RIGHT: capsule badge with LivingDot + relative time */}
          <View style={styles.tickerBadge}>
            <LivingDot color="#10B981" size={7} />
            <Text style={styles.tickerText}>{relativeTime}</Text>
          </View>
        </View>

        {/* Hero answer */}
        <Text style={styles.hero}>£0.00 Active Delays</Text>
        <Text style={styles.subtitle}>
          No qualifying delays over 15 minutes detected today on your corridors.
        </Text>
        <Text style={styles.caption}>
          We watch TfL around the clock. The moment an eligible delay hits, your
          claim lands here.
        </Text>
      </View>
    </View>
  );
}

ZeroStateHeroCard.displayName = 'ZeroStateHeroCard';

const styles = StyleSheet.create({
  outer: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.25,
    borderColor: GLASS.borderColor,
    marginBottom: 16,
    shadowColor: GLASS.shadowColor,
    shadowOffset: GLASS.shadowOffset,
    shadowOpacity: GLASS.shadowOpacity,
    shadowRadius: GLASS.shadowRadius,
    elevation: GLASS.elevation,
  },
  fill: {
    backgroundColor: 'rgba(10, 15, 60, 0.65)',
    padding: 22,
    gap: 14,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pulsingRingContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 152, 212, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.25,
    borderColor: 'rgba(0, 152, 212, 0.45)',
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: 'rgba(255, 255, 255, 0.5)',
    lineHeight: 13,
  },
  tickerBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: GLASS.borderColor,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tickerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  tickerText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.75)',
    fontWeight: '500',
  },
  hero: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    lineHeight: 19,
    marginHorizontal: 8,
  },
  caption: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    lineHeight: 16,
  },
});
