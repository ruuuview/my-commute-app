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
          {/* LEFT: pulsing ring + RADAR SENTINEL eyebrow */}
          <View style={styles.leftGroup}>
            <Animated.View style={[styles.pulsingRingContainer, ringStyle]}>
              <Broadcast size={20} color="#0098D4" weight="bold" />
            </Animated.View>
            <View>
              <Text style={styles.eyebrow}>RADAR SENTINEL</Text>
              <Text style={styles.statusSub}>Continuous 24/7</Text>
            </View>
          </View>

          {/* RIGHT: understated sync timestamp without duplicate dot */}
          <Text style={styles.syncText}>{relativeTime ? `Synced ${relativeTime.toLowerCase()}` : 'Live surveillance'}</Text>
        </View>

        {/* Hero status headline & amount */}
        <View style={styles.heroBlock}>
          <Text style={styles.heroTag}>ALL CORRIDORS CLEAR</Text>
          <Text style={styles.hero}>£0.00</Text>
          <Text style={styles.heroSub}>No Claimable Delays Today</Text>
        </View>

        <Text style={styles.subtitle}>
          No qualifying delays over 15 minutes detected on your routes.
        </Text>
        <Text style={styles.caption}>
          We monitor TfL 24/7. The moment an eligible delay hits, your claim lands here automatically.
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 152, 212, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.25,
    borderColor: 'rgba(0, 152, 212, 0.45)',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#FFFFFF',
  },
  statusSub: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.45)',
    fontWeight: '500',
  },
  syncText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.55)',
    fontWeight: '500',
  },
  heroBlock: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  heroTag: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#34C759',
    marginBottom: 4,
  },
  hero: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  heroSub: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.75)',
    marginTop: 2,
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
