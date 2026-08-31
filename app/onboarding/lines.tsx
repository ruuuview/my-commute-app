import React, { useCallback, useState, useEffect } from 'react';
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
import { Stack, useRouter, useNavigation } from 'expo-router';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useUserPreferencesStore } from '../../store/userPreferencesStore';
import { OnboardingGradient } from '../../components/OnboardingGradient';
import { ProgressDots } from '../../components/ProgressDots';
import { LineCard } from '../../components/LineCard';
import { playSound } from '../../utils/sound';
import { usePressAnimation } from '../../hooks/usePressAnimation';
import { PREMIUM_BUTTON } from '../../theme/colors';
import { LINE_IDENTITY_COLORS } from '../../constants/lineColors';
import { getSeverityLabel, getSeverityRank } from '../../utils/getSeverityColor';
import {
  SCREEN_PADDING,
  COLUMN_GAP,
} from '../../constants/layout';
const OVERGROUND_BRANCH_IDS = ['liberty', 'lioness', 'mildmay', 'suffragette', 'weaver', 'windrush'];

const TFL_LINES = [
  { id: 'bakerloo', name: 'Bakerloo', color: LINE_IDENTITY_COLORS.bakerloo, stationCount: 25 },
  { id: 'central', name: 'Central', color: LINE_IDENTITY_COLORS.central, stationCount: 49 },
  { id: 'circle', name: 'Circle', color: LINE_IDENTITY_COLORS.circle, stationCount: 36 },
  { id: 'district', name: 'District', color: LINE_IDENTITY_COLORS.district, stationCount: 60 },
  { id: 'dlr', name: 'DLR', color: LINE_IDENTITY_COLORS.dlr, stationCount: 45 },
  { id: 'elizabeth', name: 'Elizabeth', color: LINE_IDENTITY_COLORS.elizabeth, stationCount: 41 },
  { id: 'hammersmith-city', name: 'Hammersmith & City', color: LINE_IDENTITY_COLORS['hammersmith-city'], stationCount: 29 },
  { id: 'jubilee', name: 'Jubilee', color: LINE_IDENTITY_COLORS.jubilee, stationCount: 27 },
  { id: 'metropolitan', name: 'Metropolitan', color: LINE_IDENTITY_COLORS.metropolitan, stationCount: 34 },
  { id: 'northern', name: 'Northern', color: LINE_IDENTITY_COLORS.northern, stationCount: 52 },
  { id: 'overground', name: 'Overground', color: LINE_IDENTITY_COLORS.overground, stationCount: 112 },
  { id: 'piccadilly', name: 'Piccadilly', color: LINE_IDENTITY_COLORS.piccadilly, stationCount: 53 },
  { id: 'victoria', name: 'Victoria', color: LINE_IDENTITY_COLORS.victoria, stationCount: 16 },
  { id: 'waterloo-city', name: 'Waterloo & City', color: LINE_IDENTITY_COLORS['waterloo-city'], stationCount: 2 },
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
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { width, height: screenHeight } = useWindowDimensions();

  // Dynamic card height calculation to fill viewport on all devices with zero scroll
  const dynamicCardHeight = React.useMemo(() => {
    const actualHeaderHeight = insets.top + 58;
    const actualFooterHeight = Math.max(insets.bottom, 16) + 66; // paddingTop (14) + cta height (52)
    const paddingOffset = 24; // FlatList paddingTop (12) + paddingBottom above footer (12)
    const availableHeight = screenHeight - actualHeaderHeight - actualFooterHeight - paddingOffset;

    const gap = 12;
    const rows = 7;
    // Calculate and clamp between 56px and 84px
    return Math.max(56, Math.min(84, (availableHeight - (rows - 1) * gap) / rows));
  }, [screenHeight, insets]);

  const isScrollable = dynamicCardHeight <= 56;
  const footerHeight = Math.max(insets.bottom, 16) + 66;
  const listPaddingBottom = footerHeight + 12;

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
  const continueAnim = usePressAnimation('continue_btn', !canContinue);

  const shakeTranslationX = useSharedValue(0);
  const counterScale = useSharedValue(1);
  const prevCountRef = React.useRef(selectedLines.length);

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
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        playSound('deselect', 0.35);
        toggleLine(id);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        playSound('select', 0.45);
        toggleLine(id);
      }
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

    const timestamp = Date.now();
    console.log(`[AUDIO_TRIGGER] playSound pushing from lines at ${timestamp}`);

    useUserPreferencesStore.setState({ onboardingStep: 1 });
    useOnboardingStore.getState().setNavigationDirection('forward');

    requestAnimationFrame(() => {
      router.push('/onboarding/stations');
    });
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Skip line selection → dashboard. Onboarding is 2 value screens
    // (lines, stations): no TfL registration, no permission asks up front.
    useUserPreferencesStore.getState().completeOnboarding();
    const parentNav = navigation.getParent();
    if (parentNav) {
      (parentNav as any).reset({
        index: 0,
        routes: [{ name: '(tabs)' }],
      });
    } else {
      router.replace('/(tabs)');
    }
  };

  const ctaLabel = getCtaLabel(selectedLines.length);

  const getLineStatus = (severity: number, desc: string) => {
    // Code→statusType mapping delegated to the single source of truth
    // (utils/getSeverityColor.ts, AGENTS.md §0). Suspended/closure codes
    // collapse into 'severe'; the user-visible label text is preserved.
    const statusType = getSeverityLabel(severity, desc);
    const label = desc || (statusType === 'good' ? 'Good service' : statusType === 'minor' ? 'Minor delays' : 'Severe delays');
    return { statusType, label };
  };

  const resolveLineStatus = (lineId: string) => {
    let statusType: 'good' | 'minor' | 'severe' | 'suspended' | 'closure' | 'loading' | 'error' | 'unknown' = 'loading';
    let statusLabel = 'Loading status...';

    if (!loadingStatuses) {
      if (lineId === 'overground') {
        let worstSeverity = 10;
        let worstDescription = 'Good Service';
        let foundAny = false;

        OVERGROUND_BRANCH_IDS.forEach(branchId => {
          if (apiStatuses[branchId]) {
            foundAny = true;
            const statusData = apiStatuses[branchId];
            // Canonical severity rank — single source of truth (was a local
            // getRank copy that could silently diverge from utils/getSeverityColor).
            if (getSeverityRank(statusData.severity, statusData.description) > getSeverityRank(worstSeverity)) {
              worstSeverity = statusData.severity;
              worstDescription = statusData.description;
            }
          }
        });

        if (foundAny) {
          const resolved = getLineStatus(worstSeverity, worstDescription);
          statusType = resolved.statusType;
          statusLabel = resolved.label;
        } else {
          statusType = 'error';
          statusLabel = 'Status unknown';
        }
      } else {
        if (apiStatuses[lineId]) {
          const statusData = apiStatuses[lineId];
          const resolved = getLineStatus(statusData.severity, statusData.description);
          statusType = resolved.statusType;
          statusLabel = resolved.label;
        } else {
          statusType = 'error';
          statusLabel = 'Status unknown';
        }
      }
    }
    return { statusType, statusLabel };
  };

  const renderItem = ({ item }: { item: typeof TFL_LINES[0] }) => {
    const isSelected = selectedLines.includes(item.id);
    const { statusType, statusLabel } = resolveLineStatus(item.id);
    return (
      <View style={{ width: cardWidth, height: dynamicCardHeight }}>
        <LineCard
          line={item}
          selected={isSelected}
          onPress={() => handleToggleLine(item.id)}
          statusType={statusType}
          statusLabel={statusLabel}
          cardHeight={dynamicCardHeight}
        />
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <OnboardingGradient />

      {/* Skip — absolute top-right, outside header flow */}
      <Pressable
        onPress={handleSkip}
        style={[styles.skipAbsolute, { top: insets.top + 12 }]}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={styles.skipAbsoluteText}>Skip</Text>
      </Pressable>

      {/* Stack Navigator Options */}
      <Stack.Screen options={{ gestureEnabled: false, headerShown: false }} />

      {/* Header zone */}
      <View style={[styles.headerContainer, { paddingTop: insets.top + 4, paddingBottom: 2 }]}>
        <View style={{ marginBottom: 12 }}>
          <ProgressDots total={2} current={1} />
        </View>

        <Animated.View style={counterAnimStyle}>
          <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
            Your lines
            {selectedLines.length > 0 && (
              <Text style={styles.counterInline}> · {selectedLines.length} selected</Text>
            )}
          </Text>
        </Animated.View>
      </View>

      {/* Main Content Area */}
      <View style={styles.listArea}>
        <FlatList
          data={TFL_LINES}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          initialNumToRender={14}
          removeClippedSubviews={true}
          contentContainerStyle={[
            styles.listContainer,
            {
              paddingBottom: listPaddingBottom,
            },
          ]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={isScrollable}
        />
      </View>

      {/* Sticky CTA Footer */}
      <View
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  title: {
    fontSize: 22,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#FFFFFF',
    letterSpacing: -0.8,
    marginTop: 2,
  },
  counterInline: {
    fontSize: 22,
    fontFamily: 'SpaceGrotesk_500Medium',
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: -0.8,
  },
  skipAbsolute: {
    position: 'absolute',
    right: 16,
    zIndex: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: PREMIUM_BUTTON.background,
    borderWidth: PREMIUM_BUTTON.borderWidth,
    borderColor: PREMIUM_BUTTON.borderColor,
    shadowOpacity: PREMIUM_BUTTON.shadowOpacity,
    shadowRadius: PREMIUM_BUTTON.shadowRadius,
  },
  skipAbsoluteText: {
    fontSize: 12,
    fontFamily: 'SpaceGrotesk_500Medium',
    color: 'rgba(255, 255, 255, 0.30)',
  },
  listArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  listContainer: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 12,
  },

  ctaWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 14,
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
    fontFamily: 'SpaceGrotesk_700Bold',
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
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#DC2626',
  },
});
