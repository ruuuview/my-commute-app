// app/onboarding/lines.tsx — Screen 1: Line Selection (v5)

import React, { useCallback, useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  Pressable,
  useWindowDimensions,
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
import { ProgressDots } from '../../components/ProgressDots';
import { LineCard } from '../../components/LineCard';
import { playSound } from '../../utils/sound';
import { usePressAnimation } from '../../hooks/usePressAnimation';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { LINE_COLORS } from '../../constants/lineColors';
import {
  ONBOARDING_CARD_HEIGHT,
  SCREEN_PADDING,
  COLUMN_GAP,
  WIDE_LINES,
} from '../../constants/layout';

const TFL_LINES = [
  { id: 'bakerloo',         name: 'Bakerloo',           color: LINE_COLORS.bakerloo, stationCount: 25 },
  { id: 'central',          name: 'Central',            color: LINE_COLORS.central, stationCount: 49 },
  { id: 'circle',           name: 'Circle',             color: LINE_COLORS.circle, stationCount: 36 },
  { id: 'district',         name: 'District',           color: LINE_COLORS.district, stationCount: 60 },
  { id: 'dlr',              name: 'DLR',                color: LINE_COLORS.dlr, stationCount: 45 },
  { id: 'elizabeth',        name: 'Elizabeth line',     color: LINE_COLORS.elizabeth, stationCount: 41 },
  { id: 'hammersmith-city', name: 'Hammersmith & City line', color: LINE_COLORS['hammersmith-city'], stationCount: 29 },
  { id: 'jubilee',          name: 'Jubilee',            color: LINE_COLORS.jubilee, stationCount: 27 },
  { id: 'metropolitan',     name: 'Metropolitan',       color: LINE_COLORS.metropolitan, stationCount: 34 },
  { id: 'northern',         name: 'Northern',           color: LINE_COLORS.northern, stationCount: 52 },
  { id: 'overground',       name: 'London Overground',  color: LINE_COLORS.overground, stationCount: 112 },
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

interface LineRow {
  type: 'wide' | 'pair';
  items: typeof TFL_LINES;
}

export default function LinesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { width } = useWindowDimensions();

  // Dynamic card width for paired 2-column layouts
  const cardWidth = (width - SCREEN_PADDING * 2 - COLUMN_GAP) / 2;

  const selectedLines = useOnboardingStore(s => s.selectedLines);
  const toggleLine = useOnboardingStore(s => s.toggleLine);

  const [apiStatuses, setApiStatuses] = useState<Record<string, { severity: number; description: string }>>({});
  const [loadingStatuses, setLoadingStatuses] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchStatuses = async () => {
      try {
        const res = await fetch('https://api.tfl.gov.uk/Line/Mode/tube,dlr,overground,elizabeth-line,london-overground/Status');
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
  const continueAnim = usePressAnimation('continue_btn', !canContinue);

  const shakeTranslationX = useSharedValue(0);
  const counterScale = useSharedValue(1);
  const prevCountRef = React.useRef(selectedLines.length);

  const [maxLinesToast, setMaxLinesToast] = useState(false);
  const maxLinesShakeTranslationX = useSharedValue(0);

  // CTA button state transition opacity (200ms opacity animation on crossing zero)
  const ctaOpacity = useSharedValue(canContinue ? 1 : 0.35);

  useEffect(() => {
    ctaOpacity.value = withTiming(canContinue ? 1 : 0.35, {
      duration: 200,
      easing: Easing.inOut(Easing.ease),
    });
  }, [canContinue, ctaOpacity]);

  const ctaAnimatedStyle = useAnimatedStyle(() => ({
    opacity: ctaOpacity.value,
  }));

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
        toggleLine(id);
      } else {
        if (selectedLines.length >= 5) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          triggerMaxLinesShake();
          setMaxLinesToast(true);
          setTimeout(() => setMaxLinesToast(false), 1500);
          return;
        }
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
    
    const timestamp = Date.now();
    console.log(`[AUDIO_TRIGGER] playSound pushing from lines at ${timestamp}`);

    useOnboardingStore.getState().setNavigationDirection('forward');
    
    requestAnimationFrame(() => {
      router.push('/onboarding/stations');
    });
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    useUserPreferencesStore.setState({
      hasCompletedOnboarding: true,
      onboardingStep: 3,
    });

    requestAnimationFrame(() => {
      router.replace('/');
    });
  };

  const ctaLabel = getCtaLabel(selectedLines.length);

  const getLineStatus = (severity: number, desc: string) => {
    const d = desc.toLowerCase();
    if (severity === 10)                          return { statusType: 'good' as const,      label: 'Good service' };
    if (severity === 9)                           return { statusType: 'minor' as const,     label: 'Minor delays' };
    if (severity === 8 || severity === 7)         return { statusType: 'minor' as const,     label: desc || 'Reduced service' };
    if (severity === 6)                           return { statusType: 'severe' as const,    label: desc || 'Severe delays' };
    if (severity === 5 || severity === 11)        return { statusType: 'suspended' as const, label: desc || 'Part suspended' };
    if (severity === 4 || severity === 3)         return { statusType: 'closure' as const,   label: desc || 'Planned closure' };
    if (severity === 20 || severity === 0)        return { statusType: 'closure' as const,   label: 'Not running' };
    if (d.includes('closure') || d.includes('closed')) return { statusType: 'closure' as const, label: desc };
    if (d.includes('suspend'))                    return { statusType: 'suspended' as const, label: desc };
    return { statusType: 'severe' as const, label: desc || 'Severe delays' };
  };

  const resolveLineStatus = (lineId: string) => {
    let statusType: 'good' | 'minor' | 'severe' | 'suspended' | 'closure' | 'loading' | 'error' = 'loading';
    let statusLabel = 'Loading status...';
    
    if (!loadingStatuses) {
      const API_LINE_ID_MAP: Record<string, string> = {
        'overground': 'london-overground',
        'hammersmith-city': 'hammersmith-city',
        'elizabeth': 'elizabeth-line',
        'dlr': 'dlr',
      };
      const apiKey = API_LINE_ID_MAP[lineId] ?? lineId;

      if (apiStatuses[apiKey]) {
        const statusData = apiStatuses[apiKey];
        const resolved = getLineStatus(statusData.severity, statusData.description);
        statusType = resolved.statusType;
        statusLabel = resolved.label;
      } else {
        statusType = 'error';
        statusLabel = 'Status unknown';
      }
    }
    return { statusType, statusLabel };
  };

  // Group line cards into rows statically (single column for WIDE, 2-column for others)
  const chunkedLines = useMemo(() => {
    const rows: LineRow[] = [];
    let currentPair: typeof TFL_LINES = [];

    TFL_LINES.forEach((line) => {
      const isWide = WIDE_LINES.has(line.id);
      if (isWide) {
        if (currentPair.length > 0) {
          rows.push({ type: 'pair', items: currentPair });
          currentPair = [];
        }
        rows.push({ type: 'wide', items: [line] });
      } else {
        currentPair.push(line);
        if (currentPair.length === 2) {
          rows.push({ type: 'pair', items: currentPair });
          currentPair = [];
        }
      }
    });

    if (currentPair.length > 0) {
      rows.push({ type: 'pair', items: currentPair });
    }

    return rows;
  }, []);

  const renderRow = ({ item }: { item: LineRow }) => {
    if (item.type === 'wide') {
      const line = item.items[0];
      const isSelected = selectedLines.includes(line.id);
      const { statusType, statusLabel } = resolveLineStatus(line.id);

      return (
        <View style={styles.wideRowContainer}>
          <View style={{ width: width - SCREEN_PADDING * 2, height: ONBOARDING_CARD_HEIGHT }}>
            <LineCard
              line={line}
              selected={isSelected}
              onPress={() => handleToggleLine(line.id)}
              statusType={statusType}
              statusLabel={statusLabel}
            />
          </View>
        </View>
      );
    } else {
      return (
        <View style={styles.pairRowContainer}>
          {item.items.map((line) => {
            const isSelected = selectedLines.includes(line.id);
            const { statusType, statusLabel } = resolveLineStatus(line.id);

            return (
              <View key={line.id} style={{ width: cardWidth, height: ONBOARDING_CARD_HEIGHT }}>
                <LineCard
                  line={line}
                  selected={isSelected}
                  onPress={() => handleToggleLine(line.id)}
                  statusType={statusType}
                  statusLabel={statusLabel}
                />
              </View>
            );
          })}
        </View>
      );
    }
  };

  return (
    <View style={styles.root}>
      <OnboardingGradient />

      {/* Volumetric Bloom Layers */}
      {!reducedMotion && (
        <>
          <View style={styles.topBloomContainer} pointerEvents="none">
            <LinearGradient
              colors={['rgba(0, 80, 255, 0.30)', 'rgba(0, 80, 255, 0)']}
              style={StyleSheet.absoluteFillObject}
            />
          </View>
          <View style={styles.midBloomContainer} pointerEvents="none">
            <LinearGradient
              colors={['rgba(99, 102, 241, 0.22)', 'rgba(99, 102, 241, 0)']}
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

      {/* Header zone */}
      <View style={[styles.headerContainer, { paddingTop: insets.top + 8, paddingBottom: 12 }]}>
        <Text style={styles.eyebrow}>SETUP · STEP 1 OF 2</Text>
        <ProgressDots total={2} current={1} />
        
        <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
          Your lines
        </Text>
      </View>

      {/* Main Content Area */}
      <View style={styles.listArea}>
        {/* Selection Counter */}
        <Animated.View style={[styles.counterContainer, counterAnimStyle]}>
          <Text style={styles.counterText}>
            {selectedLines.length} lines selected
          </Text>
        </Animated.View>

        {/* Max lines toast */}
        {maxLinesToast && (
          <Animated.View style={[styles.maxLinesToast, maxLinesShakeStyle]}>
            <Text style={styles.maxLinesToastText}>Maximum 5 lines</Text>
          </Animated.View>
        )}

        <FlatList
          data={chunkedLines}
          renderItem={renderRow}
          keyExtractor={(_, idx) => idx.toString()}
          initialNumToRender={10}
          windowSize={5}
          removeClippedSubviews={true}
          getItemLayout={(_, index) => ({
            length: ONBOARDING_CARD_HEIGHT + COLUMN_GAP,
            offset: (ONBOARDING_CARD_HEIGHT + COLUMN_GAP) * index,
            index,
          })}
          contentContainerStyle={[
            styles.listContainer,
            { paddingBottom: insets.bottom + 120 },
          ]}
          showsVerticalScrollIndicator={false}
        />
      </View>

      {/* Sticky CTA Footer */}
      <BlurView
        intensity={28}
        tint="dark"
        style={[styles.ctaWrap, { paddingBottom: Math.max(insets.bottom, 16) }]}
      >
        <Pressable
          onPress={handleCTAPress}
          onPressIn={continueAnim.onPressIn}
          onPressOut={continueAnim.onPressOut}
          disabled={!canContinue}
          style={styles.ctaPressable}
        >
          <Animated.View
            style={[
              styles.cta,
              continueAnim.animatedStyle,
              ctaAnimatedStyle,
              {
                backgroundColor: '#FFFFFF',
              },
            ]}
          >
            <Text
              style={[
                styles.ctaText,
                { color: '#0A0F3C' },
              ]}
            >
              {ctaLabel}
            </Text>
          </Animated.View>
        </Pressable>
        
        <Pressable onPress={handleSkip} style={styles.skipPressable}>
          <Text style={styles.skipText}>Skip setup</Text>
        </Pressable>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
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
    top: 180,
    left: -40,
    right: -40,
    height: 320,
  },
  headerContainer: {
    paddingHorizontal: 16,
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.30)',
    letterSpacing: 1.8,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1,
    marginTop: 16,
  },
  listArea: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingTop: 8,
  },
  counterContainer: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  counterText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.55)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  listContainer: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 12,
  },
  wideRowContainer: {
    marginBottom: 12,
  },
  pairRowContainer: {
    flexDirection: 'row',
    gap: COLUMN_GAP,
    marginBottom: 12,
  },
  ctaWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    overflow: 'hidden',
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
    color: 'rgba(255, 255, 255, 0.35)',
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
