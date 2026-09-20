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
import { useReduceTransparency } from '../../hooks/useReduceTransparency';

export function ZeroStateHeroCard({
  checkedAtIso = null,
  isRegistered28Day = false,
  totalClaimablePence = 0,
  activeClaimsCount = 0,
}: {
  checkedAtIso?: string | null;
  isRegistered28Day?: boolean;
  totalClaimablePence?: number;
  activeClaimsCount?: number;
}) {
  const reducedMotion = useReducedMotion();
  const reduceTransparency = useReduceTransparency();
  const hasClaims = activeClaimsCount > 0 && totalClaimablePence > 0;

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
    <View style={[styles.outer, reduceTransparency && { backgroundColor: '#1C1C1E' }]}>
      {!reduceTransparency && (
        <>
          <BlurView
            intensity={GLASS.blurIntensity}
            tint={GLASS.blurTint}
            pointerEvents="none"
            style={StyleSheet.absoluteFillObject}
          />
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
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
            }}
            pointerEvents="none"
          />
        </>
      )}

      <View style={styles.fill}>
        <View style={styles.topRow}>
          {/* LEFT: pulsing ring + RADAR ACTIVE status */}
          <View style={styles.leftGroup}>
            <Animated.View style={[styles.pulsingRingContainer, ringStyle]}>
              <Broadcast size={15} color="#0098D4" weight="bold" />
            </Animated.View>
            <Text style={styles.eyebrow}>RADAR ACTIVE</Text>
          </View>

          {/* RIGHT: Live Pulse & optional 28D Protected badge */}
          <View style={styles.rightGroup}>
            {isRegistered28Day && (
              <View style={styles.protectedBadge}>
                <ShieldCheck size={11} color="#34D399" weight="fill" />
                <Text style={styles.protectedText}>28D PROTECTED</Text>
              </View>
            )}
            <View style={[styles.liveBadge, hasClaims && styles.activeLiveBadge]}>
              <Animated.View style={[styles.liveDot, hasClaims && styles.activeLiveDot, dotStyle]} />
              <Text style={[styles.liveText, hasClaims && styles.activeLiveText]}>LIVE</Text>
            </View>
          </View>
        </View>

        {/* Centered Slogan — Unconstrained & High-Contrast */}
        <Text style={styles.sloganText}>{"Your delay is money. We're counting."}</Text>

        {/* Mechanical Solari Split-Flap Board */}
        <View style={styles.heroBlock}>
          <SolariCurrencyRow amountPence={totalClaimablePence} />
        </View>

        {/* Sleek 1-Line Explanation Caption */}
        <Text style={styles.bodyCaption}>
          {hasClaims
            ? 'Eligible TfL delays detected on your commute. Tap any claim below to launch with TfL.'
            : 'When TfL delays your commute by 15+ mins, your refund claim queues here automatically.'}
        </Text>
      </View>
    </View>
  );
}

ZeroStateHeroCard.displayName = 'ZeroStateHeroCard';

const styles = StyleSheet.create({
  outer: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: GLASS.borderWidth,
    borderColor: GLASS.borderColor,
    borderTopColor: GLASS.borderTop,
    borderBottomColor: GLASS.borderBottom,
    backgroundColor: GLASS.background,
    marginBottom: 14,
    position: 'relative',
  },
  fill: {
    padding: 16,
    gap: 10,
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
    gap: 8,
  },
  pulsingRingContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 152, 212, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 152, 212, 0.35)',
  },
  eyebrow: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 10.5,
    letterSpacing: 0.8,
    color: 'rgba(255, 255, 255, 0.60)',
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
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.30)',
  },
  protectedText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 9.5,
    letterSpacing: 0.5,
    color: '#34D399',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.30)',
  },
  activeLiveBadge: {
    backgroundColor: 'rgba(255, 184, 0, 0.15)',
    borderColor: 'rgba(255, 184, 0, 0.40)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34D399',
  },
  activeLiveDot: {
    backgroundColor: '#FFB800',
  },
  liveText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 10,
    letterSpacing: 0.8,
    color: '#34D399',
  },
  activeLiveText: {
    color: '#FFB800',
  },
  sloganText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 13.5,
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.1,
    marginTop: 2,
    marginBottom: 2,
  },
  heroBlock: {
    alignItems: 'center',
    paddingVertical: 2,
  },
  bodyCaption: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 11.5,
    color: 'rgba(255, 255, 255, 0.65)',
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 4,
  },
});

export default ZeroStateHeroCard;
