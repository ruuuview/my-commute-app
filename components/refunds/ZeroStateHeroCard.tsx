// components/refunds/ZeroStateHeroCard.tsx
// Radar v2 State A' hero — live surveillance radar card with pristine Apple Liquid Glass.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Broadcast } from 'phosphor-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import { formatRelativeTime } from '../../services/refundSlaService';
import { GLASS } from '../../theme/colors';
import { SolariCurrencyRow } from './SolariCurrencyRow';

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
      <BlurView intensity={GLASS.blurIntensity} tint="dark" style={StyleSheet.absoluteFillObject} />

      <LinearGradient
        colors={[GLASS.specularStart, GLASS.specularEnd]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
        style={styles.specularTopSheen}
      />

      <View style={styles.fill}>
        <View style={styles.topRow}>
          {/* LEFT: pulsing ring + RADAR SENTINEL eyebrow */}
          <View style={styles.leftGroup}>
            <Animated.View style={[styles.pulsingRingContainer, ringStyle]}>
              <Broadcast size={18} color="#0098D4" weight="bold" />
            </Animated.View>
            <View>
              <Text style={styles.eyebrow}>RADAR SENTINEL</Text>
              <Text style={styles.statusSub}>Continuous 24/7</Text>
            </View>
          </View>

          {/* RIGHT: understated sync timestamp without duplicate dot */}
          <Text style={styles.syncText}>{relativeTime ? `Synced ${relativeTime.toLowerCase()}` : 'Live surveillance'}</Text>
        </View>

        {/* Hero status headline & split-flap amount */}
        <View style={styles.heroBlock}>
          <Text style={styles.heroTag}>ALL CORRIDORS CLEAR</Text>
          <SolariCurrencyRow amountPence={0} />
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
    backgroundColor: GLASS.background,
    marginBottom: 16,
    position: 'relative',
  },
  specularTopSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 20,
  },
  fill: {
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 152, 212, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 152, 212, 0.35)',
  },
  eyebrow: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 11,
    letterSpacing: 0.8,
    color: '#FFFFFF',
  },
  statusSub: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 10.5,
    color: 'rgba(255, 255, 255, 0.50)',
  },
  syncText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 11.5,
    color: 'rgba(255, 255, 255, 0.55)',
  },
  heroBlock: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  heroTag: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 11,
    letterSpacing: 1.2,
    color: '#34C759',
    marginBottom: 4,
  },
  heroSub: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.75)',
    marginTop: 2,
  },
  subtitle: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.70)',
    textAlign: 'center',
    lineHeight: 19,
    marginHorizontal: 8,
  },
  caption: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.45)',
    textAlign: 'center',
    lineHeight: 16,
  },
});
