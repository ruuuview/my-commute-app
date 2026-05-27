// app/onboarding/lines.tsx — Screen 1: Line Selection (v4.1 §4.2)

import React, { useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, useWindowDimensions, Platform, Image,
} from 'react-native';
import Animated, { FadeInDown, FadeIn, useReducedMotion, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
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
import BouncyPressable from '../../components/BouncyPressable';
import ProgressDots from '../../components/ProgressDots';
import { LinearGradient } from 'expo-linear-gradient';
import { useTapSound } from '../../hooks/useTapSound';
import DisruptionTicker from '../../components/DisruptionTicker';

const ONBOARDING_GRADIENT = {
  colors: ['#070714', '#0A1128', '#001040', '#000810'] as const,
  locations: [0, 0.38, 0.65, 1] as const,
  start: { x: 0.2, y: 0 },
  end: { x: 0.8, y: 1 },
};

const TEXT_PRIMARY   = 'rgba(255,255,255,0.9)';
const TEXT_SECONDARY = 'rgba(255,255,255,0.4)';
const TEXT_GHOST     = 'rgba(255,255,255,0.3)';
const TEXT_SKIP      = 'rgba(255,255,255,0.35)';
const ROW_ADDED_BG   = 'rgba(255,255,255,0.06)';
const CHIP_BG        = 'rgba(255,255,255,0.10)';
const SEARCH_BG      = 'rgba(255,255,255,0.08)';
const SEARCH_BORDER  = 'rgba(255,255,255,0.12)';

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
  const onPress = useCallback(async () => {
    if (!isSelected && isAtLimit) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (isSelected) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      playDeselect();
    } else {
      await Haptics.selectionAsync();
      playSelect();
    }

    onToggle(line.id);
  }, [isSelected, isAtLimit, line.id, onToggle, playSelect, playDeselect]);

  const disabled = !isSelected && isAtLimit;

  // Colour on OUTER wrapper — BlurView refracts it through the frost.
  const isNorthern = line.id === 'northern';
  const bgColor = isNorthern
    ? (isSelected ? '#1A1A1A' : 'rgba(255,255,255,0.06)')
    : (isSelected ? `${line.color}4D` : `${line.color}26`);  // 30% / 15%
  const borderColor = isNorthern
    ? (isSelected ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)')
    : (isSelected ? `${line.color}CC` : `${line.color}66`);  // 80% / 40%
  const borderWidth = isSelected ? 2 : 1;

  const reducedMotion = useReducedMotion();

  // Dynamic Scale Spring
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withSpring(isSelected ? 1.03 : 1, { damping: 15, stiffness: 300 });
  }, [isSelected]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Selected Box Shadow Glow for iOS Contrast Signal
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
      style={[{ width: pillWidth, opacity: disabled ? 0.35 : 1 }, animStyle, selectedShadowStyle]}
      importantForAccessibility="yes"
    >
      <BouncyPressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isSelected }}
        accessibilityLabel={`${line.name} line`}
        style={{
          borderRadius: 16,
          overflow: 'visible', // Ensure shadow is visible
        }}
      >
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
            <Ionicons
              name="checkmark-circle"
              size={18}
              color="rgba(255,255,255,0.95)"
              style={styles.checkmarkIcon}
            />
          )}
        </BlurView>
      </BouncyPressable>
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

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={ONBOARDING_GRADIENT.colors}
        locations={ONBOARDING_GRADIENT.locations}
        start={ONBOARDING_GRADIENT.start}
        end={ONBOARDING_GRADIENT.end}
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
          { paddingBottom: insets.bottom + 130 }, // spacious clearance to clear footer
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

      {/* Footer Continue CTA - standardized height & arrow badge */}
      <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + 16 }]}>
        <BouncyPressable
          onPress={async () => {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            playSelect();
            push('/onboarding/stations');
          }}
          disabled={!canContinue}
          accessibilityRole="button"
          accessibilityLabel={
            canContinue ? 'Continue to station selection' : 'Select at least one line to continue'
          }
          accessibilityState={{ disabled: !canContinue }}
          style={[
            styles.cta,
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
        </BouncyPressable>
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
