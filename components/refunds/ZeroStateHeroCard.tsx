// components/refunds/ZeroStateHeroCard.tsx
// Radar v2 State A' hero — live surveillance radar card with pristine Apple Liquid Glass.

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Broadcast, ShieldCheck } from 'phosphor-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  useReducedMotion,
  Easing,
} from 'react-native-reanimated';
import { GLASS } from '../../theme/colors';
import { SolariCurrencyRow } from './SolariCurrencyRow';

export default function ZeroStateHeroCard({
  checkedAtIso = null,
  isRegistered28Day = false,
}: {
  checkedAtIso?: string | null;
  isRegistered28Day?: boolean;
}) {
  const reducedMotion = useReducedMotion();

  // Slow breathing pulse on the surveillance ring
  const ringPulse = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) {
      ringPulse.value = 0;
      return;
    }
    ringPulse.value = withRepeat(withTiming(1, { duration: 1600 }), -1, true);
  }, [ringPulse, reducedMotion]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.15 * ringPulse.value }],
    opacity: 1 - 0.25 * ringPulse.value,
  }));

  // Continuous Reanimated breathing physics for the emerald ● LIVE dot (opacity 0.35 <-> 1.0 every 2s)
  const dotOpacity = useSharedValue(1);
  useEffect(() => {
    if (reducedMotion) {
      dotOpacity.value = 1;
      return;
    }
    dotOpacity.value = withRepeat(
      withTiming(0.35, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [dotOpacity, reducedMotion]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: dotOpacity.value,
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

          {/* RIGHT: Live Pulse & optional 28D Protected badge */}
          <View style={styles.rightGroup}>
            {isRegistered28Day && (
              <View style={styles.protectedBadge}>
                <ShieldCheck size={12} color="#34D399" weight="fill" />
                <Text style={styles.protectedText}>28D PROTECTED</Text>
              </View>
            )}
            <View style={styles.liveBadge}>
              <Animated.View style={[styles.liveDot, dotStyle]} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>
        </View>

        {/* Hero status headline & split-flap amount */}
        <View style={styles.heroBlock}>
          <Text style={styles.heroTag}>ALL CORRIDORS CLEAR</Text>
          <SolariCurrencyRow amountPence={0} />
        </View>

        {/* Strict 2-line clean reassurance */}
        <View style={styles.bodyBlock}>
          <Text style={styles.bodyTitle}>No Delays Detected Today</Text>
          <Text style={styles.bodyCaption}>
            Monitoring your lines 24/7. Eligible delays over 15 mins queue here automatically.
          </Text>
        </View>
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
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  protectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.30)',
  },
  protectedText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 10,
    letterSpacing: 0.6,
    color: '#34D399',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.30)',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#34D399',
    shadowColor: '#34D399',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  liveText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 10.5,
    letterSpacing: 0.8,
    color: '#34D399',
  },
  heroBlock: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  heroTag: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 11,
    letterSpacing: 1.2,
    color: '#34D399',
    marginBottom: 6,
  },
  bodyBlock: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
  },
  bodyTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 15,
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  bodyCaption: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 12.5,
    color: 'rgba(255, 255, 255, 0.75)',
    textAlign: 'center',
    lineHeight: 18,
  },
});
