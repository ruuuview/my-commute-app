// app/onboarding/lines.tsx — Screen 1: Line Selection (v2)

import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useUserPreferencesStore } from '../../store/userPreferencesStore';
import { OnboardingGradient } from '../../components/OnboardingGradient';
import { ProgressPips } from '../../components/ProgressPips';
import { LineCard } from '../../components/LineCard';
import { LINE_CARD_HEIGHT, CARD_VERTICAL_GAP } from '../../constants/layout';
import { playSound } from '../../utils/sound';
import { usePressAnimation } from '../../hooks/usePressAnimation';
import { LinearGradient } from 'expo-linear-gradient';

// ─── 14 TfL lines with verified station counts ──────────────────────────────
const TFL_LINES = [
  { id: 'bakerloo',         name: 'Bakerloo',           color: '#B36305', stationCount: 25 },
  { id: 'central',          name: 'Central',            color: '#E32017', stationCount: 49 },
  { id: 'circle',           name: 'Circle',             color: '#FFD300', stationCount: 36 },
  { id: 'district',         name: 'District',           color: '#00782A', stationCount: 60 },
  { id: 'dlr',              name: 'DLR',                color: '#00AFAD', stationCount: 45 },
  { id: 'elizabeth',        name: 'Elizabeth',          color: '#6950A1', stationCount: 41 },
  { id: 'hammersmith-city', name: 'Hammersmith & City', color: '#F3A9BB', stationCount: 29 },
  { id: 'jubilee',          name: 'Jubilee',            color: '#A0A5A9', stationCount: 27 },
  { id: 'metropolitan',     name: 'Metropolitan',       color: '#9B0056', stationCount: 34 },
  { id: 'northern',         name: 'Northern',           color: '#1A1A1A', stationCount: 52 },
  { id: 'overground',       name: 'Overground',         color: '#EE7C0E', stationCount: 112 },
  { id: 'piccadilly',       name: 'Piccadilly',         color: '#003688', stationCount: 53 },
  { id: 'victoria',         name: 'Victoria',           color: '#0098D4', stationCount: 16 },
  { id: 'waterloo-city',    name: 'Waterloo & City',    color: '#95CDBA', stationCount: 2 },
];

export default function LinesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  const selectedLines = useOnboardingStore(s => s.selectedLines);
  const toggleLine = useOnboardingStore(s => s.toggleLine);

  const canContinue = selectedLines.length > 0;
  const continueAnim = usePressAnimation('continue_btn', false);

  // Counter shake values
  const shakeTranslationX = useSharedValue(0);
  const triggerCounterShake = () => {
    shakeTranslationX.value = withSequence(
      withTiming(-8, { duration: 60, easing: Easing.linear }),
      withTiming(8, { duration: 60, easing: Easing.linear }),
      withTiming(-6, { duration: 60, easing: Easing.linear }),
      withTiming(6, { duration: 60, easing: Easing.linear }),
      withTiming(0, { duration: 60, easing: Easing.linear })
    );
  };

  const counterAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeTranslationX.value }],
  }));

  const handleToggleLine = useCallback(
    async (id: string) => {
      const isSelected = selectedLines.includes(id);
      if (isSelected) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      toggleLine(id);
    },
    [selectedLines, toggleLine]
  );

  const handleCTAPress = async () => {
    if (selectedLines.length === 0) {
      triggerCounterShake();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    playSound('push', 0.38);
    
    // Set flow direction and navigate
    useOnboardingStore.getState().setNavigationDirection('forward');
    router.push('/onboarding/stations');
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    useUserPreferencesStore.getState().completeOnboarding();
  };

  const ctaLabel = selectedLines.length === 0
    ? 'Select at least one line'
    : selectedLines.length === 1
    ? 'Continue with 1 line'
    : `Continue with ${selectedLines.length} lines`;

  const renderItem = ({ item }: { item: typeof TFL_LINES[number] }) => {
    const isSelected = selectedLines.includes(item.id);
    return (
      <LineCard
        line={item}
        selected={isSelected}
        onPress={() => handleToggleLine(item.id)}
      />
    );
  };

  return (
    <View style={styles.root}>
      {/* Scope OnboardingGradient component directly here */}
      <OnboardingGradient />

      {/* Volumetric Bloom Layers (hidden when reduced motion is active) */}
      {!reducedMotion && (
        <>
          <View style={styles.topBloomContainer} pointerEvents="none">
            <LinearGradient
              colors={['rgba(0, 68, 238, 0.18)', 'rgba(0, 68, 238, 0)']}
              style={StyleSheet.absoluteFillObject}
            />
          </View>
          <View style={styles.midBloomContainer} pointerEvents="none">
            <LinearGradient
              colors={['rgba(184, 192, 240, 0.12)', 'rgba(184, 192, 240, 0)']}
              style={StyleSheet.absoluteFillObject}
            />
          </View>
        </>
      )}

      {/* Grain Overlay */}
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        <Image
          source={require('../../assets/images/grain.png')}
          style={[StyleSheet.absoluteFillObject, { opacity: 0.03 }]}
          resizeMode="repeat"
        />
      </View>

      {/* Stack Navigator Options */}
      <Stack.Screen options={{ gestureEnabled: false, headerShown: false }} />

      {/* Header zone with dark background crown contrast */}
      <View style={[styles.headerContainer, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.eyebrow}>SETUP · STEP 1 OF 2</Text>
        <ProgressPips total={2} current={1} />
        
        <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
          Your lines
        </Text>
        <Text 
          style={styles.subtitle} 
          accessibilityElementsHidden={true} 
          allowFontScaling 
          maxFontSizeMultiplier={1.4}
        >
          Choose the lines you travel on
        </Text>
      </View>

      {/* Pearl Data Zone Grid Container */}
      <View style={styles.pearlDataZone}>
        {/* Selection Counter - positioned at top of pearl zone */}
        <Animated.View style={[styles.counterContainer, counterAnimStyle]}>
          <Text style={styles.counterText}>
            {selectedLines.length} lines selected
          </Text>
        </Animated.View>

        <FlatList
          data={TFL_LINES}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          numColumns={2}
          initialNumToRender={12}
          windowSize={5}
          removeClippedSubviews={true}
          getItemLayout={(_data, index) => {
            const row = Math.floor(index / 2);
            return {
              length: LINE_CARD_HEIGHT + CARD_VERTICAL_GAP,
              offset: (LINE_CARD_HEIGHT + CARD_VERTICAL_GAP) * row,
              index,
            };
          }}
          contentContainerStyle={[
            styles.listContainer,
            { paddingBottom: insets.bottom + 120 },
          ]}
          columnWrapperStyle={styles.columnWrapper}
          showsVerticalScrollIndicator={false}
        />
      </View>

      {/* Sticky CTA Footer */}
      <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          onPress={handleCTAPress}
          onPressIn={continueAnim.onPressIn}
          onPressOut={continueAnim.onPressOut}
          style={styles.ctaPressable}
        >
          <Animated.View
            style={[
              styles.cta,
              continueAnim.animatedStyle,
              {
                backgroundColor: canContinue ? '#0044EE' : 'rgba(0,68,238,0.12)',
                shadowColor: canContinue ? 'rgba(0,68,238,0.35)' : 'transparent',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: canContinue ? 1 : 0,
                shadowRadius: 20,
                elevation: canContinue ? 4 : 0,
              },
            ]}
          >
            <Text
              style={[
                styles.ctaText,
                { color: canContinue ? '#FFFFFF' : 'rgba(0,68,238,0.60)' },
              ]}
            >
              {ctaLabel}
            </Text>
          </Animated.View>
        </Pressable>
        
        <Pressable onPress={handleSkip} style={styles.skipPressable}>
          <Text style={styles.skipText}>Skip setup</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ECEFFE',
  },
  topBloomContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
  },
  midBloomContainer: {
    position: 'absolute',
    top: 250,
    left: 0,
    right: 0,
    height: 250,
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.38)',
    letterSpacing: 1.6,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1,
    marginTop: 16,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.42)',
    marginTop: 6,
  },
  pearlDataZone: {
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#ECEFFE',
    paddingTop: 16,
  },
  counterContainer: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  counterText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(10,15,60,0.30)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  listContainer: {
    paddingHorizontal: 16,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: CARD_VERTICAL_GAP,
  },
  ctaWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: 'rgba(236,239,254,0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(10,20,100,0.05)',
  },
  ctaPressable: {
    width: '100%',
  },
  cta: {
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontSize: 16,
    fontFamily: 'System',
    fontWeight: '700',
  },
  skipPressable: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  skipText: {
    fontSize: 12,
    color: 'rgba(10,15,60,0.38)',
    textDecorationLine: 'underline',
  },
});
