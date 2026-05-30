// app/onboarding/lines.tsx — Screen 1: Line Selection (v4.6)

import React, { useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, useWindowDimensions, Image, Pressable,
} from 'react-native';
import Animated, {
  FadeInDown, FadeIn, useReducedMotion, useSharedValue, useAnimatedStyle,
  withTiming, withDelay, Easing, runOnJS, ZoomIn, ZoomOut,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as SplashScreen from 'expo-splash-screen';
import * as Haptics from 'expo-haptics';
import {
  useFonts, SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useOnboardingStore } from '../../store/onboardingStore';
import ProgressDots from '../../components/ProgressDots';
import { LinearGradient } from 'expo-linear-gradient';
import { useTapSound } from '../../hooks/useTapSound';
import DisruptionTicker from '../../components/DisruptionTicker';
import { usePressAnimation } from '../../hooks/usePressAnimation';

import { MASTER_BACKGROUND_GRADIENT, DASHBOARD_OVERLAY_GRADIENT } from '../../theme/colors';



// ─── 14 TfL lines (§1.3 + DLR) ──────────────────────────────────────────────
const TFL_LINES = [
  { id: 'bakerloo',         name: 'Bakerloo',           color: '#B36305' },
  { id: 'central',          name: 'Central',            color: '#E32017' },
  { id: 'circle',           name: 'Circle',             color: '#FFD300' },
  { id: 'district',         name: 'District',           color: '#00782A' },
  { id: 'dlr',              name: 'DLR',                color: '#00AFAD' },
  { id: 'elizabeth',        name: 'Elizabeth',          color: '#6950A1' },
  { id: 'hammersmith-city', name: 'Hammersmith & City', color: '#F3A9BB' },
  { id: 'jubilee',          name: 'Jubilee',            color: '#A0A5A9' },
  { id: 'metropolitan',     name: 'Metropolitan',       color: '#9B0056' },
  { id: 'northern',         name: 'Northern',           color: '#1A1A1A' },
  { id: 'overground',       name: 'Overground',         color: '#EE7C0E' },
  { id: 'piccadilly',       name: 'Piccadilly',         color: '#003688' },
  { id: 'victoria',         name: 'Victoria',           color: '#0098D4' },
  { id: 'waterloo-city',    name: 'Waterloo & City',    color: '#95CDBA' },
];

const MAX     = 5;
const H_PAD   = 16;
const GAP     = 10;

// ─── Single Pill ─────────────────────────────────────────────────────────────
const Pill = React.memo(function Pill({
  line,
  isSelected,
  isAtLimit,
  onToggle,
  pillWidth,
  delay,
  playSelect,
  playDeselect,
}: {
  line: typeof TFL_LINES[number];
  isSelected: boolean;
  isAtLimit: boolean;
  onToggle: (id: string) => void;
  pillWidth: number;
  delay: number;
  playSelect: () => void;
  playDeselect: () => void;
}) {
  const disabled = !isSelected && isAtLimit;

  const onPress = useCallback(async () => {
    if (!isSelected && isAtLimit) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (isSelected) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); // Soft deep Light thud on deselect
      playDeselect();
    } else {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); // Assertive Medium thud on select
      playSelect();
    }

    onToggle(line.id);
  }, [isSelected, isAtLimit, line.id, onToggle, playSelect, playDeselect]);

  // Hook handles select/deselect scale spring properties perfectly per task requirements
  const configKey = isSelected ? 'line_deselect' : 'line_select';
  const { onPressIn, onPressOut, animatedStyle } = usePressAnimation(configKey, disabled);

  const isNorthern = line.id === 'northern';
  const bgColor = isNorthern
    ? (isSelected ? '#1A1A1A' : 'rgba(255,255,255,0.06)')
    : (isSelected ? `${line.color}4D` : `${line.color}26`);
  const borderColor = isNorthern
    ? (isSelected ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)')
    : (isSelected ? `${line.color}CC` : `${line.color}66`);
  const borderWidth = isSelected ? 2 : 1;

  const reducedMotion = useReducedMotion();

  // Radial Glow Bloom Animation
  const glowProgress = useSharedValue(isSelected ? 1 : 0);
  React.useEffect(() => {
    if (reducedMotion) {
      glowProgress.value = isSelected ? 1 : 0;
      return;
    }
    glowProgress.value = withTiming(isSelected ? 1 : 0, {
      duration: 350,
      easing: Easing.out(Easing.quad),
    });
  }, [isSelected, reducedMotion, glowProgress]);

  const glowStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: 0.8 + 0.2 * glowProgress.value }],
      opacity: 0.12 * glowProgress.value,
    };
  });

  const selectedShadowStyle = isSelected ? {
    shadowColor: line.color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 4,
  } : {};

  return (
    <Animated.View
      entering={reducedMotion ? FadeIn.duration(80) : FadeInDown.delay(delay).springify().damping(15).stiffness(150)}
      style={[{ width: pillWidth }, selectedShadowStyle]}
      importantForAccessibility="yes"
    >
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isSelected }}
        accessibilityLabel={`${line.name} line`}
        style={{
          borderRadius: 16,
          overflow: 'visible',
          opacity: disabled ? 0.35 : 1,
        }}
      >
        <Animated.View style={[animatedStyle, { borderRadius: 16, overflow: 'hidden' }]}>
          {/* Radial Glow Bloom Backing */}
          <Animated.View
            style={[
              StyleSheet.absoluteFillObject,
              {
                borderRadius: 16,
                backgroundColor: isNorthern ? '#FFFFFF' : line.color,
              },
              glowStyle,
            ]}
          />
          <BlurView
            intensity={30}
            tint="dark"
            style={[
              styles.pillBlur,
              {
                backgroundColor: bgColor,
                borderColor: borderColor,
                borderWidth: borderWidth,
              },
            ]}
          >
            <Text
              style={styles.pillText}
              numberOfLines={1}
              allowFontScaling
              maxFontSizeMultiplier={1.3}
              adjustsFontSizeToFit={true}
              minimumFontScale={0.85}
            >
              {line.name}
            </Text>

            {isSelected && (
              <Animated.View
                entering={ZoomIn.springify().damping(10).stiffness(180)}
                exiting={ZoomOut.duration(100)}
                style={styles.checkmarkIcon}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color="rgba(255,255,255,0.95)"
                />
              </Animated.View>
            )}
          </BlurView>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
});

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function LinesScreen() {
  const { push }      = useRouter();
  const insets        = useSafeAreaInsets();
  const { width }     = useWindowDimensions();
  const selectedLines = useOnboardingStore(s => s.selectedLines);
  const toggleLine    = useOnboardingStore(s => s.toggleLine);
  const isAtLimit     = selectedLines.length >= MAX;
  const canContinue   = selectedLines.length > 0;
  const { playSelect, playDeselect } = useTapSound();

  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });
  useEffect(() => { if (fontsLoaded) SplashScreen.hideAsync(); }, [fontsLoaded]);

  const pillWidth = (width - H_PAD * 2 - GAP) / 2;

  // Continue CTA capsule scale spring animation
  const continueAnim = usePressAnimation('continue_btn', !canContinue);

  // Shared-axis slide transitions
  const transitionX = useSharedValue(60);
  const transitionOpacity = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      transitionX.value = 0;
      transitionOpacity.value = 1;
      return;
    }
    transitionX.value = withDelay(40, withTiming(0, {
      duration: 280,
      easing: Easing.out(Easing.poly(4)),
    }));
    transitionOpacity.value = withDelay(40, withTiming(1, {
      duration: 280,
      easing: Easing.out(Easing.poly(4)),
    }));
  }, [reducedMotion, transitionX, transitionOpacity]);

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: transitionX.value }],
    opacity: transitionOpacity.value,
  }));

  return (
    <View style={styles.root}>
      {/* Layer 4: Base Linear Grid */}
      <LinearGradient
        colors={MASTER_BACKGROUND_GRADIENT.colors}
        locations={MASTER_BACKGROUND_GRADIENT.locations}
        start={MASTER_BACKGROUND_GRADIENT.start}
        end={MASTER_BACKGROUND_GRADIENT.end}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Layer 3: Top-Left Accent (45% Height, diagonal flow) */}
      <LinearGradient
        colors={['#001E5A', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '45%' }}
      />
      {/* Layer 2: Top-Right Bloom (50% Height, diagonal flow) */}
      <LinearGradient
        colors={['#002470', 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', top: 0, right: 0, width: '100%', height: '50%' }}
      />
      {/* Layer 1: Top-Center Glow (60% Height, vertical flow) */}
      <LinearGradient
        colors={['#003B8E', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '60%' }}
      />
      {/* Universal Dashboard Edge Overlay */}
      <LinearGradient
        colors={DASHBOARD_OVERLAY_GRADIENT.colors}
        locations={DASHBOARD_OVERLAY_GRADIENT.locations}
        start={DASHBOARD_OVERLAY_GRADIENT.start}
        end={DASHBOARD_OVERLAY_GRADIENT.end}
        pointerEvents={DASHBOARD_OVERLAY_GRADIENT.pointerEvents}
        style={StyleSheet.absoluteFillObject}
      />
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        <Image
          source={require('../../assets/images/grain.png')}
          style={[StyleSheet.absoluteFillObject, { opacity: 0.03 }]}
          resizeMode="repeat"
        />
      </View>
      <Stack.Screen options={{ gestureEnabled: false, headerShown: false }} />

      {/* Status Bar / Notch Padding Spacer */}
      <View style={{ height: insets.top }} />

      {/* Live Disruption Ticker Marquee */}
      <DisruptionTicker />

      {/* Progress dots — pinned below status bar */}
      <Animated.View style={[{ flex: 1 }, slideStyle]}>
        <ProgressDots currentStep={0} totalSteps={2} style={{ paddingTop: 16 }} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2} allowFontScaling maxFontSizeMultiplier={1.3}>
          {'Which lines\ndo you ride?'}
        </Text>
        <Text style={styles.subtitle} allowFontScaling maxFontSizeMultiplier={1.4}>
          {"We're already watching them."}
        </Text>
      </View>

      {/* Grid ScrollView */}
      <ScrollView
        style={styles.flex1}
        contentContainerStyle={[
          styles.grid,
          { paddingBottom: insets.bottom + 130 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pillGrid}>
          {TFL_LINES.map((line, index) => (
            <Pill
              key={line.id}
              line={line}
              isSelected={selectedLines.includes(line.id)}
              isAtLimit={isAtLimit}
              onToggle={toggleLine}
              pillWidth={pillWidth}
              delay={index * 35}
              playSelect={playSelect}
              playDeselect={playDeselect}
            />
          ))}
        </View>
      </ScrollView>

      </Animated.View>

      {/* Footer Continue CTA - standardized height & arrow badge */}
      <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          onPressIn={continueAnim.onPressIn}
          onPressOut={continueAnim.onPressOut}
          onPress={async () => {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            playSelect();
            if (reducedMotion) {
              push('/onboarding/stations');
              return;
            }
            transitionX.value = withTiming(-60, {
              duration: 280,
              easing: Easing.out(Easing.poly(4)),
            });
            transitionOpacity.value = withTiming(0, {
              duration: 280,
              easing: Easing.out(Easing.poly(4)),
            }, (finished) => {
              if (finished) {
                runOnJS(push)('/onboarding/stations');
              }
            });
          }}
          disabled={!canContinue}
          accessibilityRole="button"
          accessibilityLabel={
            canContinue ? 'Continue to station selection' : 'Select at least one line to continue'
          }
          accessibilityState={{ disabled: !canContinue }}
        >
          <Animated.View
            style={[
              styles.cta,
              continueAnim.animatedStyle,
              {
                backgroundColor: canContinue ? '#FFFFFF' : 'rgba(255,255,255,0.12)',
              },
            ]}
          >
            <View style={styles.ctaContent}>
              <Text style={[
                styles.ctaText,
                { color: canContinue ? '#0A0A0F' : 'rgba(255,255,255,0.35)' },
              ]}>
                Continue
              </Text>
              {canContinue && (
                <View style={styles.arrowBadge}>
                  <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                </View>
              )}
            </View>
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingHorizontal: H_PAD,
    paddingBottom: 16,
  },
  title: {
    fontSize: 32,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: 'rgba(255,255,255,0.95)',
    letterSpacing: -0.5,
    lineHeight: 38,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255,255,255,0.60)',
  },
  grid: {
    paddingHorizontal: H_PAD,
    flexGrow: 1,
  },
  pillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  pillBlur: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    borderRadius: 16,
    overflow: 'hidden',
  },
  pillText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'SpaceGrotesk_500Medium',
    color: 'rgba(255,255,255,0.95)',
    marginRight: 6,
  },
  ctaWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: H_PAD,
    paddingTop: 12,
    backgroundColor: 'rgba(13,11,23,0.88)',
  },
  cta: {
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  arrowBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0A0A0F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontSize: 16,
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  checkmarkIcon: { marginRight: 14 },
  flex1: { flex: 1 },
});
