// app/onboarding/lines.tsx — Screen 1: Line Selection (v4.1 §4.2)

import React, { useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, useWindowDimensions,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as SplashScreen from 'expo-splash-screen';
import * as Haptics from 'expo-haptics';
import {
  useFonts, SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useUserPreferencesStore } from '../../store/userPreferencesStore';
import VoidBackground, { VOID_ROOT_COLOR } from '../../components/VoidBackground';
import BouncyPressable from '../../components/BouncyPressable';
import ProgressDots from '../../components/ProgressDots';

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
  { id: 'northern',         name: 'Northern',           color: '#3A3A3C' },
  { id: 'overground',       name: 'Overground',         color: '#EE7C0E' },
  { id: 'piccadilly',       name: 'Piccadilly',         color: '#003688' },
  { id: 'victoria',         name: 'Victoria',           color: '#0098D4' },
  { id: 'waterloo-city',    name: 'Waterloo & City',    color: '#95CDBA' },
];

const MAX     = 5;
const H_PAD   = 16;
const GAP     = 10;

// ─── Hex → rgba opacity helpers ──────────────────────────────────────────────
// Appends 2-char hex alpha to a 6-char hex colour string
const withAlpha = (hex: string, alpha: string) => `${hex}${alpha}`;

// ─── Single Pill ─────────────────────────────────────────────────────────────
const Pill = React.memo(function Pill({
  line,
  isSelected,
  isAtLimit,
  onToggle,
  pillWidth,
  delay,
}: {
  line: typeof TFL_LINES[number];
  isSelected: boolean;
  isAtLimit: boolean;
  onToggle: (id: string) => void;
  pillWidth: number;
  delay: number;
}) {
  const onPress = useCallback(async () => {
    if (!isSelected && isAtLimit) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    isSelected
      ? await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      : await Haptics.selectionAsync();
    onToggle(line.id);
  }, [isSelected, isAtLimit, line.id, onToggle]);

  const disabled = !isSelected && isAtLimit;

  // Fix 1 — pill background IS the line colour at 15% (unselected) or 30% (selected)
  const bgColor     = isSelected ? withAlpha(line.color, '4D') : withAlpha(line.color, '26');
  const borderColor = isSelected ? withAlpha(line.color, 'CC') : withAlpha(line.color, '66');
  const borderWidth = isSelected ? 1.5 : 1;

  return (
    <Animated.View
      entering={FadeInDown.delay(delay).springify()}
      style={{ width: pillWidth, opacity: disabled ? 0.35 : 1 }}
    >
      <BouncyPressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isSelected }}
        accessibilityLabel={`${line.name} line`}
        style={{ borderRadius: 16, overflow: 'hidden', marginBottom: GAP }}
      >
        {/* BlurView refracts the VoidBackground gradient — glass over colour */}
        <BlurView tint="light" intensity={25} style={styles.pillBlur}>
          {/* Fix 1 — tinted colour overlay on top of blur */}
          <View style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: bgColor, borderRadius: 16, borderWidth, borderColor },
          ]} />

          <Text
            style={styles.pillText}
            numberOfLines={1}
            allowFontScaling
            maxFontSizeMultiplier={1.3}
          >
            {line.name}
          </Text>

          {isSelected && (
            <Ionicons
              name="checkmark-circle"
              size={18}
              color="rgba(255,255,255,0.95)"
              style={{ marginRight: 14 }}
            />
          )}
        </BlurView>
      </BouncyPressable>
    </Animated.View>
  );
});

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function LinesScreen() {
  const router        = useRouter();
  const insets        = useSafeAreaInsets();
  const { width }     = useWindowDimensions();
  const selectedLines = useUserPreferencesStore(s => s.selectedLines);
  const toggleLine    = useUserPreferencesStore(s => s.toggleLine);
  const isAtLimit     = selectedLines.length >= MAX;
  const canContinue   = selectedLines.length > 0;

  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });
  useEffect(() => { if (fontsLoaded) SplashScreen.hideAsync(); }, [fontsLoaded]);

  const pillWidth = (width - H_PAD * 2 - GAP) / 2;

  return (
    // Fix 2 — root color matches gradient start: zero black bleed-through
    <View style={[styles.root, { backgroundColor: VOID_ROOT_COLOR }]}>
      <VoidBackground />
      <Stack.Screen options={{ gestureEnabled: false, headerShown: false }} />

      {/* Progress dots — pinned below status bar */}
      <ProgressDots currentStep={0} totalSteps={3} style={{ paddingTop: insets.top + 16 }} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2} allowFontScaling maxFontSizeMultiplier={1.3}>
          {'Which lines\ndo you travel?'}
        </Text>
        {/* Fix 4 (subtitle) — "Select your lines." */}
        <Text style={styles.subtitle} allowFontScaling maxFontSizeMultiplier={1.4}>
          Select your lines.
        </Text>
      </View>

      {/* Fix 3 — ScrollView content clears absolute CTA via paddingBottom */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.grid,
          { paddingBottom: insets.bottom + 100 },
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
            />
          ))}
        </View>
      </ScrollView>

      {/* Fix 3 — absolute CTA: pills never obscured by footer */}
      <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + 16 }]}>
        <BouncyPressable
          onPress={async () => {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/onboarding/stations');
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
          <Text style={[
            styles.ctaText,
            { color: canContinue ? '#0A0A0F' : 'rgba(255,255,255,0.35)' },
          ]}>
            Continue
          </Text>
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

  // Fix 3 — absolute footer scrim
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
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontSize: 16,
    fontFamily: 'SpaceGrotesk_700Bold',
  },
});
