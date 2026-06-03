// app/onboarding/lines.tsx — Screen 1: Line Selection (v2)

import React, { useCallback, useState, useEffect } from 'react';
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
import { LINE_COLORS } from '../../constants/lineColors';

// ─── 14 TfL lines with verified station counts ──────────────────────────────
const TFL_LINES = [
  { id: 'bakerloo',         name: 'Bakerloo',           color: LINE_COLORS.bakerloo, stationCount: 25 },
  { id: 'central',          name: 'Central',            color: LINE_COLORS.central, stationCount: 49 },
  { id: 'circle',           name: 'Circle',             color: LINE_COLORS.circle, stationCount: 36 },
  { id: 'district',         name: 'District',           color: LINE_COLORS.district, stationCount: 60 },
  { id: 'dlr',              name: 'DLR',                color: LINE_COLORS.dlr, stationCount: 45 },
  { id: 'elizabeth',        name: 'Elizabeth',          color: LINE_COLORS.elizabeth, stationCount: 41 },
  { id: 'hammersmith-city', name: 'Hammersmith & City', color: LINE_COLORS['hammersmith-city'], stationCount: 29 },
  { id: 'jubilee',          name: 'Jubilee',            color: LINE_COLORS.jubilee, stationCount: 27 },
  { id: 'metropolitan',     name: 'Metropolitan',       color: LINE_COLORS.metropolitan, stationCount: 34 },
  { id: 'northern',         name: 'Northern',           color: LINE_COLORS.northern, stationCount: 52 },
  { id: 'overground',       name: 'Overground',         color: LINE_COLORS.overground, stationCount: 112 },
  { id: 'piccadilly',       name: 'Piccadilly',         color: LINE_COLORS.piccadilly, stationCount: 53 },
  { id: 'victoria',         name: 'Victoria',           color: LINE_COLORS.victoria, stationCount: 16 },
  { id: 'waterloo-city',    name: 'Waterloo & City',    color: LINE_COLORS['waterloo-city'], stationCount: 2 },
];

function getCtaLabel(selectedCount: number): string {
  if (selectedCount === 0) {
    return 'Select at least one line';
  }
  if (selectedCount === 1) {
    return 'Continue with 1 line';
  }
  return `Continue with ${selectedCount} lines`;
}

export default function LinesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  const selectedLines = useOnboardingStore(s => s.selectedLines);
  const toggleLine = useOnboardingStore(s => s.toggleLine);

  const [apiStatuses, setApiStatuses] = useState<Record<string, { severity: number; description: string }>>({});
  const [loadingStatuses, setLoadingStatuses] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchStatuses = async () => {
      try {
        const res = await fetch('https://api.tfl.gov.uk/Line/Mode/tube,dlr,overground,elizabeth-line/Status');
        if (!res.ok) throw new Error('Failed to fetch TfL status');
        const data = await res.json();
        if (!active) return;
        
        const mapped: Record<string, { severity: number; description: string }> = {};
        data.forEach((line: any) => {
          const sev = line.lineStatuses?.[0]?.statusSeverity ?? 10;
          const desc = line.lineStatuses?.[0]?.statusSeverityDescription ?? 'Good Service';
          mapped[line.id] = { severity: sev, description: desc };
        });
        setApiStatuses(mapped);
        setLoadingStatuses(false);
      } catch (err) {
        console.log('Error fetching onboarding line statuses:', err);
        if (active) {
          setLoadingStatuses(false);
        }
      }
    };
    fetchStatuses();
    return () => {
      active = false;
    };
  }, []);

  const canContinue = selectedLines.length > 0;
  const continueAnim = usePressAnimation('continue_btn', false);

  // Counter animations: Shake and Scale Pulse
  const shakeTranslationX = useSharedValue(0);
  const counterScale = useSharedValue(1);
  const prevCountRef = React.useRef(selectedLines.length);

  const [maxLinesToast, setMaxLinesToast] = useState(false);
  const maxLinesShakeTranslationX = useSharedValue(0);

  const triggerMaxLinesShake = useCallback(() => {
    maxLinesShakeTranslationX.value = withSequence(
      withTiming(-8, { duration: 60, easing: Easing.linear }),
      withTiming(8, { duration: 60, easing: Easing.linear }),
      withTiming(-6, { duration: 60, easing: Easing.linear }),
      withTiming(6, { duration: 60, easing: Easing.linear }),
      withTiming(0, { duration: 60, easing: Easing.linear })
    );
  }, [maxLinesShakeTranslationX]);

  const maxLinesShakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: maxLinesShakeTranslationX.value }],
  }));

  const triggerCounterShake = () => {
    shakeTranslationX.value = withSequence(
      withTiming(-8, { duration: 60, easing: Easing.linear }),
      withTiming(8, { duration: 60, easing: Easing.linear }),
      withTiming(-6, { duration: 60, easing: Easing.linear }),
      withTiming(6, { duration: 60, easing: Easing.linear }),
      withTiming(0, { duration: 60, easing: Easing.linear })
    );
  };

  useEffect(() => {
    if (selectedLines.length !== prevCountRef.current) {
      prevCountRef.current = selectedLines.length;
      if (!reducedMotion) {
        counterScale.value = withSequence(
          withTiming(1.15, { duration: 75 }),
          withTiming(1, { duration: 75 })
        );
      }
    }
  }, [selectedLines.length, reducedMotion, counterScale]);

  const counterAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: shakeTranslationX.value },
      { scale: counterScale.value }
    ],
  }));

  const handleToggleLine = useCallback(
    async (id: string) => {
      const isSelected = selectedLines.includes(id);
      if (isSelected) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        toggleLine(id);
      } else {
        if (selectedLines.length >= 5) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          triggerMaxLinesShake();
          setMaxLinesToast(true);
          setTimeout(() => setMaxLinesToast(false), 1500);
          return;
        }
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        toggleLine(id);
      }
    },
    [selectedLines, toggleLine, triggerMaxLinesShake]
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

  const ctaLabel = getCtaLabel(selectedLines.length);

  const getLineStatus = (severity: number, desc: string) => {
    if (severity === 10) {
      return { statusType: 'good' as const, label: 'Good service' };
    } else if (severity === 9) {
      return { statusType: 'minor' as const, label: 'Minor delays' };
    } else if (severity === 8 || severity === 7) {
      return { statusType: 'minor' as const, label: desc || 'Reduced service' };
    } else if (severity === 4) {
      return { statusType: 'closure' as const, label: 'Planned closure' };
    } else if (severity === 3 || severity === 2 || severity === 1 || severity === 5 || severity === 11) {
      return { statusType: 'suspended' as const, label: desc || 'Part suspended' };
    } else {
      return { statusType: 'severe' as const, label: desc || 'Severe delays' };
    }
  };

  const renderItem = ({ item }: { item: typeof TFL_LINES[number] }) => {
    const isSelected = selectedLines.includes(item.id);
    const statusData = apiStatuses[item.id] || { severity: 10, description: 'Good Service' };
    
    let statusType: 'good' | 'minor' | 'severe' | 'suspended' | 'closure' | 'loading' | 'error' = 'loading';
    let statusLabel = 'Loading status...';
    
    if (!loadingStatuses) {
      if (apiStatuses[item.id]) {
        const resolved = getLineStatus(statusData.severity, statusData.description);
        statusType = resolved.statusType;
        statusLabel = resolved.label;
      } else {
        statusType = 'error';
        statusLabel = 'Status unknown';
      }
    }

    return (
      <LineCard
        line={item}
        selected={isSelected}
        onPress={() => handleToggleLine(item.id)}
        statusType={statusType}
        statusLabel={statusLabel}
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

        {/* Max lines toast nudge — positioned inline above the line list */}
        {maxLinesToast && (
          <Animated.View style={[styles.maxLinesToast, maxLinesShakeStyle]}>
            <Text style={styles.maxLinesToastText}>Maximum 5 lines</Text>
          </Animated.View>
        )}

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
      <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + 8 }]}>
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
    backgroundColor: 'transparent',
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
  maxLinesToast: {
    backgroundColor: 'rgba(220, 38, 38, 0.12)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 10,
    marginHorizontal: 16,
    alignSelf: 'flex-start',
  },
  maxLinesToastText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
});
