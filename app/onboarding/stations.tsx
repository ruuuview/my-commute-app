// app/onboarding/stations.tsx — Screen 2: Station Search with Premium Custom Bottom Sheet Overlay (v4.6)

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, ScrollView,
  Pressable, Keyboard, useWindowDimensions, Image,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Animated, {
  FadeInDown, FadeIn, FadeOutLeft, ZoomIn, ZoomOut, useSharedValue, useAnimatedStyle,
  withTiming, withDelay, Easing, runOnJS, useReducedMotion, withSpring
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import Fuse from 'fuse.js';
import * as Haptics from 'expo-haptics';
import {
  useFonts, SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useUserPreferencesStore } from '../../store/userPreferencesStore';
import { TfLStation, FULL_STATIONS } from '../../data/tflStations';
import { LinearGradient } from 'expo-linear-gradient';
import { useTapSound } from '../../hooks/useTapSound';
import { usePressAnimation } from '../../hooks/usePressAnimation';
import DepartureCard from '../../components/DepartureCard';
import ProgressDots from '../../components/ProgressDots';
import { MASTER_BACKGROUND_GRADIENT } from '../../theme/colors';

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_PINS = 5;
const ROW_HEIGHT = 64;

// ─── Locked Design Tokens ─────────────────────────────────────────────────────

const TEXT_PRIMARY   = 'rgba(255,255,255,0.9)';
const TEXT_SECONDARY = 'rgba(255,255,255,0.4)';
const TEXT_GHOST     = 'rgba(255,255,255,0.3)';
const TEXT_SKIP      = 'rgba(255,255,255,0.35)';
const ROW_ADDED_BG   = 'rgba(255,255,255,0.06)';
const CHIP_BG        = 'rgba(255,255,255,0.10)';
const SEARCH_BORDER  = 'rgba(255,255,255,0.12)';

// ─── Line colour map for dots in search results ───────────────────────────────
const LINE_COLORS: Record<string, string> = {
  bakerloo: '#B36305', central: '#E32017', circle: '#FFD300',
  district: '#00782A', dlr: '#00AFAD', elizabeth: 'rgb(106, 16, 153)',
  'hammersmith-city': '#F3A9BB', jubilee: '#A0A5A9', metropolitan: '#9B0056',
  northern: '#1A1A1A', overground: '#EE7C0E', piccadilly: '#003688',
  victoria: '#0098D4', 'waterloo-city': '#95CDBA',
  // Rebranded Overground Lines
  'london-overground': '#EE7C0E',
  weaver: '#EE7C0E',
  mildmay: '#EE7C0E',
  windrush: '#EE7C0E',
  suffragette: '#EE7C0E',
  lioness: '#EE7C0E',
  liberty: '#EE7C0E',
};

// ─── Helper: Group & Deduplicate Station Lists by Name ────────────────────────
const cleanAndDeduplicate = (rawStations: TfLStation[]): TfLStation[] => {
  const map: Record<string, TfLStation> = {};
  for (const st of rawStations) {
    const cleanName = st.name
       .replace(/\s*(?:Underground Station|Elizabeth line Station|Overground Station|DLR Station|Rail Station|Station)$/i, '')
       .trim();
    const key = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (map[key]) {
      map[key].lines = Array.from(new Set([...map[key].lines, ...st.lines]));
      if (map[key].zone === undefined && st.zone !== undefined) {
        map[key].zone = st.zone;
      }
    } else {
      map[key] = {
        ...st,
        name: cleanName,
        lines: [...st.lines],
      };
    }
  }
  return Object.values(map);
};

// ─── Line dots row ────────────────────────────────────────────────────────────
function LineDots({ lines }: { lines: string[] }) {
  return (
    <View style={styles.lineDotsContainer}>
      {lines.map(l => {
        const isNorthern = l === 'northern';
        const isCircle = l === 'circle';
        const isElizabeth = l === 'elizabeth';

        const bg = LINE_COLORS[l] ?? '#888';
        const borderW = (isNorthern || isCircle || isElizabeth) ? 1 : 0;

        let borderC = 'rgba(255,255,255,0.4)';
        if (isNorthern) borderC = 'rgba(255,255,255,0.35)';
        else if (isElizabeth) borderC = 'rgba(255,255,255,0.9)';

        return (
          <View
            key={l}
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: bg,
              borderWidth: borderW,
              borderColor: borderC,
            }}
          />
        );
      })}
    </View>
  );
}

// ─── Search result row ────────────────────────────────────────────────────────
const StationRow = React.memo(function StationRow({
  station,
  isPinned,
  onTap,
}: {
  station: TfLStation;
  isPinned: boolean;
  onTap: (s: TfLStation) => void;
}) {
  const rowAnim = usePressAnimation('station_row');
  const addBtnAnim = usePressAnimation('nav_item');

  return (
    <Pressable
      onPressIn={rowAnim.onPressIn}
      onPressOut={rowAnim.onPressOut}
      onPress={() => onTap(station)}
      accessibilityRole="button"
      accessibilityLabel={`${station.name}, Zone ${station.zone}${isPinned ? ', already added' : ''}`}
    >
      <Animated.View
        style={[
          styles.row,
          isPinned && styles.rowAdded,
          rowAnim.animatedStyle,
        ]}
      >
        <View style={styles.flex1}>
          <Text style={styles.rowName}>{station.name}</Text>
          <View style={styles.stationRowZoneContainer}>
            {station.zone !== undefined && <Text style={styles.rowZone}>Zone {station.zone}</Text>}
            <LineDots lines={station.lines} />
          </View>
        </View>

        {/* Right — add/added button */}
        <Pressable
          onPressIn={addBtnAnim.onPressIn}
          onPressOut={addBtnAnim.onPressOut}
          onPress={() => onTap(station)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Animated.View
            style={[
              isPinned ? styles.addedCircle : styles.addCircle,
              addBtnAnim.animatedStyle,
            ]}
          >
            <Animated.View
              entering={ZoomIn.springify().damping(12)}
              exiting={ZoomOut.duration(100)}
              key={isPinned ? 'check' : 'plus'}
            >
              <Ionicons
                name={isPinned ? 'checkmark' : 'add'}
                size={14}
                color={isPinned ? '#070714' : 'rgba(255,255,255,0.7)'}
              />
            </Animated.View>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Pressable>
  );
});

// ─── Screen Component ──────────────────────────────────────────────────────────
export default function StationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const { playSelect, playDeselect } = useTapSound();
  
  const pinnedStations = useOnboardingStore(s => s.pinnedStations);
  const addStation = useOnboardingStore(s => s.addStation);
  const removeStation = useOnboardingStore(s => s.removeStation);
  const selectedLines = useOnboardingStore(s => s.selectedLines);

  const [query, setQuery] = useState('');
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const chipScrollViewRef = useRef<ScrollView>(null);

  const prevPinnedCount = useRef(pinnedStations.length);
  useEffect(() => {
    if (pinnedStations.length > prevPinnedCount.current) {
      setTimeout(() => {
        chipScrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
    prevPinnedCount.current = pinnedStations.length;
  }, [pinnedStations.length]);

  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold,
  });

  const canContinue = pinnedStations.length > 0;

  // 1. Deduplicate full station list (memoized once)
  const cleanFullStations = useMemo(() => cleanAndDeduplicate(FULL_STATIONS), []);

  // 2. Compute popular stations dynamically, filtered to overlap with selectedLines
  const popularStations = useMemo(() => {
    const POPULAR_NAMES = ['bank', 'canary wharf', "king's cross st pancras", 'waterloo', 'liverpool street'];
    const filteredPopular = cleanFullStations.filter(st => {
      const normalizedName = st.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      return POPULAR_NAMES.some(pName => pName.replace(/[^a-z0-9]/g, '') === normalizedName);
    });
    filteredPopular.sort((a, b) => {
      const aNorm = a.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const bNorm = b.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      const aIdx = POPULAR_NAMES.findIndex(pName => pName.replace(/[^a-z0-9]/g, '') === aNorm);
      const bIdx = POPULAR_NAMES.findIndex(pName => pName.replace(/[^a-z0-9]/g, '') === bNorm);
      return aIdx - bIdx;
    });
    return filteredPopular.filter(st => 
      st.lines.some(l => selectedLines.includes(l))
    );
  }, [selectedLines, cleanFullStations]);

  // 3. Memoized Search results using dynamic threshold formula
  const results = useMemo<TfLStation[]>(() => {
    if (!query.trim()) return popularStations;

    const fuse = new Fuse(cleanFullStations, {
      keys: ['name'],
      threshold: 0.2,
      distance: 30,
      ignoreLocation: false,
      includeScore: true,
      shouldSort: true,
    });

    const cleanQuery = query.toLowerCase().replace(/'/g, '');
    const searchResults = fuse.search(cleanQuery);

    return searchResults
      .filter((r) => (r.score ?? 1) < 0.2)
      .sort((a, b) => {
        const q = cleanQuery;
        const aStarts = a.item.name.toLowerCase().replace(/'/g, '').startsWith(q);
        const bStarts = b.item.name.toLowerCase().replace(/'/g, '').startsWith(q);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return (a.score ?? 1) - (b.score ?? 1);
      })
      .map((r) => r.item);
  }, [query, popularStations, cleanFullStations]);

  // 4. Instant Selection Toggle with Haptics (No Bottom Sheet)
  const handleRowTap = useCallback((station: TfLStation) => {
    const isPinned = pinnedStations.some(p => p.id === station.id);
    if (isPinned) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      playDeselect();
      removeStation(station.id);
    } else {
      if (pinnedStations.length >= MAX_PINS) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      playSelect();
      addStation({
        id: station.id,
        name: station.name,
        lineIds: station.lines,
        zone: station.zone ?? 1,
      });
    }
  }, [pinnedStations, addStation, removeStation, playSelect, playDeselect]);

  const pinnedIds = useMemo(() => new Set(pinnedStations.map(p => p.id)), [pinnedStations]);

  // Bottom sheet translation values
  const sheetHeight = screenHeight * 0.6;
  const sheetTranslateY = useSharedValue(sheetHeight);

  const openBottomSheet = () => {
    setIsSheetOpen(true);
    sheetTranslateY.value = withSpring(0, { damping: 20, stiffness: 200 });
    setTimeout(() => {
      inputRef.current?.focus();
    }, 250);
  };

  const closeBottomSheet = useCallback(() => {
    Keyboard.dismiss();
    // 60ms layout stagger: keyboard dismisses first, sheet drops exactly at peak velocity
    setTimeout(() => {
      sheetTranslateY.value = withSpring(sheetHeight, { damping: 20, stiffness: 200 }, (finished) => {
        if (finished) {
          runOnJS(setIsSheetOpen)(false);
        }
      });
    }, 60);
    setQuery('');
  }, [sheetTranslateY, sheetHeight]);

  const renderItem = useCallback(({ item }: { item: TfLStation }) => (
    <StationRow
      station={item}
      isPinned={pinnedIds.has(item.id)}
      onTap={(station) => {
        handleRowTap(station);
        closeBottomSheet();
      }}
    />
  ), [pinnedIds, handleRowTap, closeBottomSheet]);

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

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playDeselect();
    if (reducedMotion) {
      router.back();
      return;
    }
    transitionX.value = withTiming(60, {
      duration: 280,
      easing: Easing.out(Easing.poly(4)),
    });
    transitionOpacity.value = withTiming(0, {
      duration: 280,
      easing: Easing.out(Easing.poly(4)),
    }, (finished) => {
      if (finished) {
        runOnJS(router.back)();
      }
    });
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    const onboarding = useOnboardingStore.getState();
    const mappedStations = onboarding.pinnedStations.map((station, index) => ({
      id: station.id,
      name: station.name,
      lines: station.lineIds,
      role: index === 0 ? ('home' as const) : index === 1 ? ('work' as const) : ('other' as const),
    }));

    useUserPreferencesStore.setState({
      selectedLines: onboarding.selectedLines,
      pinnedStations: mappedStations,
    });

    useUserPreferencesStore.getState().completeOnboarding();
  };

  const resultCountText = useMemo(() => {
    if (!query.trim()) return 'Popular stations';
    const count = results.length;
    if (count > 10) return `Showing top 10 of ${count}`;
    return `${count} result${count !== 1 ? 's' : ''}`;
  }, [query, results]);

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  // Hook mappings to consume physical configs per specifications
  const backAnim = usePressAnimation('back_btn');
  const skipAnim = usePressAnimation('skip_btn');
  const searchBarTriggerAnim = usePressAnimation('continue_btn');
  const zeroStateBtnAnim = usePressAnimation('continue_btn');
  const ctaBtnAnim = usePressAnimation('continue_btn', !canContinue);
  const overlayCloseAnim = usePressAnimation('back_btn');

  if (!fontsLoaded) return null;

  return (
    <Pressable style={styles.flex1} onPress={() => Keyboard.dismiss()}>
      <View style={styles.flex1}>
        <LinearGradient
          colors={MASTER_BACKGROUND_GRADIENT.colors}
          locations={MASTER_BACKGROUND_GRADIENT.locations}
          start={MASTER_BACKGROUND_GRADIENT.start}
          end={MASTER_BACKGROUND_GRADIENT.end}
          style={StyleSheet.absoluteFillObject}
        />
        <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
          <Image
            source={require('../../assets/images/grain.png')}
            style={[StyleSheet.absoluteFillObject, { opacity: 0.03 }]}
            resizeMode="repeat"
          />
        </View>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />

        <Animated.View style={[{ flex: 1 }, slideStyle]}>

          {/* ─── BACKGROUND DASHBOARD VIEW ─── */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingBottom: insets.bottom + 180,
            }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Navigation & Progress Header */}
            <View style={[styles.navHeader, { paddingTop: insets.top + 8 }]}>
              <Pressable
                onPressIn={backAnim.onPressIn}
                onPressOut={backAnim.onPressOut}
                onPress={handleBack}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                accessibilityRole="button"
                accessibilityLabel="Go back to line selection"
              >
                <Animated.View style={[styles.navHeaderBtn, backAnim.animatedStyle]}>
                  <Ionicons name="chevron-back" size={20} color={TEXT_PRIMARY} />
                  <Text style={styles.navBackText}>Back</Text>
                </Animated.View>
              </Pressable>

              <ProgressDots currentStep={1} totalSteps={2} style={styles.navProgressDots} />

              <Pressable
                onPressIn={skipAnim.onPressIn}
                onPressOut={skipAnim.onPressOut}
                onPress={handleSkip}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                accessibilityRole="button"
                accessibilityLabel="Skip station selection"
              >
                <Animated.View style={[styles.navHeaderBtnRight, skipAnim.animatedStyle]}>
                  <Text style={styles.navSkipText}>Skip</Text>
                </Animated.View>
              </Pressable>
            </View>

            {/* Header Title */}
            <View style={styles.header}>
              <Text style={styles.title} numberOfLines={1} allowFontScaling maxFontSizeMultiplier={1.3}>
                {'Where do you catch it?'}
              </Text>
            </View>

            {/* Header Micro-confirmation: Selected Lines */}
            {selectedLines.length > 0 && (
              <View style={styles.selectedLinesStrip}>
                {selectedLines.map((lineId: string) => {
                  const name = lineId.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                  return (
                    <View key={lineId} style={[styles.microLinePill, { backgroundColor: LINE_COLORS[lineId] || '#888' }]}>
                      <Text style={styles.microLineText}>{name}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Pinned Chip Scroll Strip */}
            {pinnedStations.length > 0 && (
              <Animated.View entering={FadeInDown.duration(200)} style={styles.chipScrollWrap}>
                <ScrollView
                  ref={chipScrollViewRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}
                >
                  {pinnedStations.map((station) => {
                    const fullSt = cleanFullStations.find(s => s.id === station.id);
                    const displayZone = fullSt?.zone !== undefined ? ` (Z${fullSt.zone})` : '';
                    const removeBtnAnim = usePressAnimation('nav_item'); // eslint-disable-line react-hooks/rules-of-hooks
                    return (
                      <Animated.View
                        key={station.id}
                        exiting={FadeOutLeft.duration(150)}
                        style={styles.pinnedChip}
                      >
                        <Ionicons name="checkmark" size={12} color={TEXT_PRIMARY} style={{ marginRight: 4 }} />
                        <Text
                          style={styles.pinnedChipText}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.8}
                        >
                          {station.name}{displayZone}
                        </Text>
                        <Pressable
                          onPressIn={removeBtnAnim.onPressIn}
                          onPressOut={removeBtnAnim.onPressOut}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            playDeselect();
                            removeStation(station.id);
                          }}
                        >
                          <Animated.View style={[styles.chipRemoveBtn, removeBtnAnim.animatedStyle]}>
                            <Ionicons name="close" size={14} color={TEXT_SECONDARY} />
                          </Animated.View>
                        </Pressable>
                      </Animated.View>
                    );
                  })}
                </ScrollView>
              </Animated.View>
            )}

            {/* Live Departure Cards for Pinned Stations */}
            {pinnedStations.length > 0 ? (
              <Animated.View
                entering={FadeInDown.springify().damping(15)}
                style={{ paddingHorizontal: 16, marginTop: 12, gap: 12 }}
              >
                {pinnedStations.map((station) => (
                  <Animated.View key={station.id} entering={ZoomIn.springify().damping(12)}>
                    <DepartureCard
                      stationId={station.id}
                      stationName={station.name}
                      onDelete={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        playDeselect();
                        removeStation(station.id);
                      }}
                      isEditing={true}
                      autoExpand={true}
                    />
                  </Animated.View>
                ))}
              </Animated.View>
            ) : (
              /* Premium Dashboard Zero State when no stations are pinned */
              <Animated.View
                entering={FadeInDown.duration(400)}
                style={styles.dashboardZeroState}
              >
                <View style={styles.dashboardZeroIconBg}>
                  <Ionicons name="train-outline" size={32} color="#FFFFFF" />
                </View>
                <Text style={styles.dashboardZeroTitle}>Your Departure Board</Text>
                <Text style={styles.dashboardZeroSubtitle}>
                  Add your commuter stations to build a real-time departures and live disruptions monitor.
                </Text>
                <Pressable
                  onPressIn={zeroStateBtnAnim.onPressIn}
                  onPressOut={zeroStateBtnAnim.onPressOut}
                  onPress={openBottomSheet}
                >
                  <Animated.View style={[styles.zeroStateBtn, zeroStateBtnAnim.animatedStyle]}>
                    <Text style={styles.zeroStateBtnText}>Search Stations</Text>
                    <Ionicons name="search" size={14} color="#0A0A0F" />
                  </Animated.View>
                </Pressable>
              </Animated.View>
            )}
          </ScrollView>

          {/* Sticky CTA Footer Container */}
          <View style={[styles.ctaFooterContainer, { bottom: insets.bottom + 16 }]}>
            {/* Pinned Add Trigger Capsule */}
            {pinnedStations.length > 0 && (
              <Pressable
                onPressIn={searchBarTriggerAnim.onPressIn}
                onPressOut={searchBarTriggerAnim.onPressOut}
                onPress={openBottomSheet}
              >
                <Animated.View style={[styles.addStationTriggerBtn, searchBarTriggerAnim.animatedStyle]}>
                  <Ionicons name="add" size={20} color={TEXT_PRIMARY} />
                  <Text style={styles.addStationTriggerBtnText}>Add Station</Text>
                </Animated.View>
              </Pressable>
            )}

            {/* Main Continue button */}
            {pinnedStations.length > 0 && (
              <Pressable
                onPressIn={ctaBtnAnim.onPressIn}
                onPressOut={ctaBtnAnim.onPressOut}
                onPress={async () => {
                  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  playSelect();
                  
                  const onboarding = useOnboardingStore.getState();
                  const mappedStations = onboarding.pinnedStations.map((station, index) => ({
                    id: station.id,
                    name: station.name,
                    lines: station.lineIds,
                    role: index === 0 ? ('home' as const) : index === 1 ? ('work' as const) : ('other' as const),
                  }));

                  useUserPreferencesStore.setState({
                    selectedLines: onboarding.selectedLines,
                    pinnedStations: mappedStations,
                  });

                  useUserPreferencesStore.getState().completeOnboarding();
                }}
                disabled={!canContinue}
                accessibilityRole="button"
                accessibilityLabel={canContinue ? 'Continue to permissions' : 'Add at least one station to continue'}
                accessibilityState={{ disabled: !canContinue }}
              >
                <Animated.View
                  style={[
                    styles.cta,
                    ctaBtnAnim.animatedStyle,
                    {
                      backgroundColor: canContinue ? '#FFFFFF' : 'rgba(255,255,255,0.12)',
                      opacity: canContinue ? 1 : 0.35,
                    },
                  ]}
                >
                  <View style={styles.ctaContent}>
                    <Text style={[styles.ctaText, { color: canContinue ? '#0A0A0F' : TEXT_SKIP }]}>
                      Continue ({pinnedStations.length} added)
                    </Text>
                    {canContinue && (
                      <View style={styles.arrowBadge}>
                        <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                      </View>
                    )}
                  </View>
                </Animated.View>
              </Pressable>
            )}
          </View>

          {/* ─── ACTIVE CUSTOM BOTTOM SHEET SEARCH OVERLAY ─── */}
          {isSheetOpen && (
            <Animated.View style={[StyleSheet.absoluteFillObject, { zIndex: 100 }]} entering={FadeIn.duration(200)} exiting={ZoomOut.duration(150)}>
              {/* Tap Outside Scrim */}
              <Pressable style={StyleSheet.absoluteFillObject} onPress={closeBottomSheet}>
                <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFillObject} />
              </Pressable>

              {/* Bottom Sheet Container */}
              <Animated.View
                style={[
                  styles.bottomSheet,
                  sheetAnimatedStyle,
                  {
                    height: sheetHeight,
                    top: screenHeight - sheetHeight,
                  },
                ]}
              >
                <View style={styles.sheetHandle} />

                <View style={styles.overlayContent}>
                  {/* Overlay Search Header */}
                  <View style={styles.overlayHeader}>
                    <Pressable
                      onPressIn={overlayCloseAnim.onPressIn}
                      onPressOut={overlayCloseAnim.onPressOut}
                      onPress={closeBottomSheet}
                    >
                      <Animated.View style={[styles.overlayCloseBtn, overlayCloseAnim.animatedStyle]}>
                        <Ionicons name="close" size={22} color={TEXT_PRIMARY} />
                      </Animated.View>
                    </Pressable>

                    <View style={styles.overlaySearchWrap}>
                      <Ionicons name="search-outline" size={16} color={TEXT_SECONDARY} style={styles.searchIcon} />
                      <TextInput
                        ref={inputRef}
                        value={query}
                        onChangeText={setQuery}
                        placeholder="Search 471 stations..."
                        placeholderTextColor={TEXT_SKIP}
                        autoFocus
                        autoCorrect={false}
                        autoCapitalize="none"
                        returnKeyType="search"
                        style={styles.searchInput}
                      />
                      {query.length > 0 && (
                        <Pressable onPress={() => setQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                          <Ionicons name="close-circle" size={18} color={TEXT_SECONDARY} style={styles.clearIcon} />
                        </Pressable>
                      )}
                    </View>
                  </View>

                  {/* Result Count Label */}
                  <Text style={styles.sectionLabel}>
                    {resultCountText}
                  </Text>

                  {/* Search Results FlashList */}
                  <View style={{ flex: 1, width: '100%' }}>
                    <FlashList
                      data={results}
                      keyExtractor={item => item.id}
                      renderItem={renderItem}
                      keyboardShouldPersistTaps="handled"
                      keyboardDismissMode="on-drag"
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={{ paddingBottom: 80 }}
                      ListEmptyComponent={
                        <View style={styles.emptyState}>
                          <Ionicons name="search-outline" size={28} color={TEXT_GHOST} />
                          <Text style={styles.emptyText}>No stations found</Text>
                          <Text style={styles.emptyHint}>Try &quot;Waterloo&quot; or &quot;Paddington&quot;</Text>
                        </View>
                      }
                    />
                  </View>
                </View>
              </Animated.View>
            </Animated.View>
          )}
        </Animated.View>
      </View>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },
  flex1: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  title: {
    fontSize: 32,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: TEXT_PRIMARY,
    letterSpacing: -0.5,
    lineHeight: 38,
  },
  lineDotsContainer: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  stationRowZoneContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  searchIcon: { marginLeft: 14 },
  clearIcon: { marginRight: 12 },

  // Navigation Header
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  navHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 60,
  },
  navHeaderBtnRight: {
    alignItems: 'flex-end',
    minWidth: 60,
  },
  navBackText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 14,
    color: TEXT_PRIMARY,
    marginLeft: 2,
  },
  navSkipText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 14,
    color: TEXT_SKIP,
  },
  navProgressDots: {
    flex: 1,
    paddingBottom: 0,
  },

  // Pinned Chips Strip
  chipScrollWrap: {
    height: 36,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  pinnedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CHIP_BG,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pinnedChipText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 13,
    color: TEXT_PRIMARY,
  },
  chipRemoveBtn: {
    marginLeft: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: CHIP_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Premium Dashboard Zero State when no stations are pinned
  dashboardZeroState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
    marginTop: 20,
    marginHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  dashboardZeroIconBg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  dashboardZeroTitle: {
    fontSize: 20,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: TEXT_PRIMARY,
    textAlign: 'center',
    marginBottom: 8,
  },
  dashboardZeroSubtitle: {
    fontSize: 14,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  zeroStateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  zeroStateBtnText: {
    color: '#0A0A0F',
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 14,
  },

  // Custom Bottom Sheet Search Overlay
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: 'rgba(20, 20, 36, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginVertical: 8,
  },
  overlayContent: {
    flex: 1,
  },
  overlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  overlayCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlaySearchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 14,
    height: 48,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: TEXT_PRIMARY,
    paddingHorizontal: 10,
    height: '100%',
  },

  sectionLabel: {
    fontSize: 11,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: TEXT_SECONDARY,
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1.0,
  },

  // Result row — fixed 64pt
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SEARCH_BORDER,
  },
  rowAdded: {
    backgroundColor: ROW_ADDED_BG,
  },
  rowName: {
    fontSize: 15,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: TEXT_PRIMARY,
  },
  rowZone: {
    fontSize: 11,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: TEXT_SECONDARY,
    marginRight: 4,
  },

  // Action icons
  addCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addedCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 13,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
  },

  // Sticky CTA Footer Layout
  ctaFooterContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 10,
    gap: 12,
  },
  addStationTriggerBtn: {
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addStationTriggerBtnText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 14,
    color: TEXT_PRIMARY,
  },
  ctaCountLabel: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: TEXT_SECONDARY,
    textAlign: 'center',
    marginBottom: 8,
  },
  cta: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
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
  ctaText: { fontSize: 16, fontFamily: 'SpaceGrotesk_700Bold' },

  selectedLinesStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, marginBottom: 12 },
  microLinePill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  microLineText: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 12, color: '#FFF' },
});
