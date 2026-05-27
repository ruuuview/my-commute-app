// app/onboarding/stations.tsx — Screen 2: Station Search (v4.5 §4.3 + §17.5)

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, ScrollView,
  Pressable, Platform, Keyboard, useWindowDimensions, Image,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeInDown, FadeOutLeft, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { useSharedValue, useAnimatedStyle, withSequence, withSpring } from 'react-native-reanimated';
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
import BouncyPressable from '../../components/BouncyPressable';
import ProgressDots from '../../components/ProgressDots';
import { LinearGradient } from 'expo-linear-gradient';
import { useTapSound } from '../../hooks/useTapSound';
import { SpringPressable } from '../../components/SpringPressable';
import DepartureCard from '../../components/DepartureCard';

// ─── Constants ────────────────────────────────────────────────────────────────
const STATION_SEARCH_PLACEHOLDER = 'Find your home, work, or transfer station...';
const MAX_PINS = 5;
const ROW_HEIGHT = 64;

// ─── Locked Design Tokens ─────────────────────────────────────────────────────
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

// ─── Search result row — fixed 64pt height for FlatList performance ───────────
const StationRow = React.memo(function StationRow({
  station,
  isPinned,
  onTap,
}: {
  station: TfLStation;
  isPinned: boolean;
  onTap: (s: TfLStation) => void;
}) {
  return (
    <SpringPressable
      onPress={() => onTap(station)}
      pressScale={0.97}
      style={[
        styles.row,
        isPinned && styles.rowAdded,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${station.name}, Zone ${station.zone}${isPinned ? ', already added' : ''}`}
    >
      <View style={styles.flex1}>
        <Text style={styles.rowName}>{station.name}</Text>
        <View style={styles.stationRowZoneContainer}>
          {station.zone !== undefined && <Text style={styles.rowZone}>Zone {station.zone}</Text>}
          <LineDots lines={station.lines} />
        </View>
      </View>

      {/* Right — add/added button */}
      <SpringPressable
        onPress={() => onTap(station)}
        pressScale={0.88}
        overshoot={!isPinned}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={isPinned ? styles.addedCircle : styles.addCircle}
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
      </SpringPressable>
    </SpringPressable>
  );
});

// ─── Screen Component ──────────────────────────────────────────────────────────
export default function StationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { playSelect, playDeselect } = useTapSound();
  
  const pinnedStations = useOnboardingStore(s => s.pinnedStations);
  const addStation = useOnboardingStore(s => s.addStation);
  const removeStation = useOnboardingStore(s => s.removeStation);
  const selectedLines = useOnboardingStore(s => s.selectedLines);

  const [query, setQuery] = useState('');
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

  const isAtLimit = pinnedStations.length >= MAX_PINS;
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

  const renderItem = useCallback(({ item }: { item: TfLStation }) => (
    <StationRow
      station={item}
      isPinned={pinnedIds.has(item.id)}
      onTap={handleRowTap}
    />
  ), [pinnedIds, handleRowTap]);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index,
  }), []);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playDeselect();
    router.back();
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

  if (!fontsLoaded) return null;

  return (
    <Pressable style={styles.flex1} onPress={() => Keyboard.dismiss()}>
      <View style={styles.flex1}>
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
        <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />

        {/* Navigation & Progress Header */}
        <View style={[styles.navHeader, { paddingTop: insets.top + 8 }]}>
          <SpringPressable
            onPress={handleBack}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            style={styles.navHeaderBtn}
            pressScale={0.95}
            accessibilityRole="button"
            accessibilityLabel="Go back to line selection"
          >
            <Ionicons name="chevron-back" size={20} color={TEXT_PRIMARY} />
            <Text style={styles.navBackText}>Back</Text>
          </SpringPressable>

          <ProgressDots currentStep={1} totalSteps={2} style={styles.navProgressDots} />

          <SpringPressable
            onPress={handleSkip}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            style={styles.navHeaderBtnRight}
            pressScale={0.96}
            accessibilityRole="button"
            accessibilityLabel="Skip station selection"
          >
            <Text style={styles.navSkipText}>Skip</Text>
          </SpringPressable>
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
                    <SpringPressable
                      pressScale={0.85}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        playDeselect();
                        removeStation(station.id);
                      }}
                      style={styles.chipRemoveBtn}
                    >
                      <Ionicons name="close" size={14} color={TEXT_SECONDARY} />
                    </SpringPressable>
                  </Animated.View>
                );
              })}
            </ScrollView>
          </Animated.View>
        )}

        {/* Search bar */}
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={16} color={TEXT_SECONDARY} style={styles.searchIcon} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder={STATION_SEARCH_PLACEHOLDER}
            placeholderTextColor={TEXT_SKIP}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            style={styles.searchInput}
            accessibilityLabel="Search London stations"
            accessibilityRole="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={18} color={TEXT_SECONDARY} style={styles.clearIcon} />
            </Pressable>
          )}
        </View>

        {/* Live Departure Cards for Pinned Stations */}
        {pinnedStations.length > 0 && (
          <Animated.View
            entering={FadeInDown.springify().damping(15)}
            style={{ paddingHorizontal: 16, marginBottom: 8 }}
          >
            {pinnedStations.map((station) => (
              <DepartureCard
                key={station.id}
                stationId={station.id}
                stationName={station.name}
                onDelete={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  playDeselect();
                  removeStation(station.id);
                }}
                isEditing={true}
              />
            ))}
          </Animated.View>
        )}

        {/* Section label */}
        <Text style={styles.sectionLabel}>
          {resultCountText}
        </Text>

        {/* Results list — utilizing FlashList for 60fps performance */}
        <View style={{ flex: 1, width: '100%' }}>
          <FlashList
            data={results}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 150 }}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={28} color={TEXT_GHOST} />
                <Text style={styles.emptyText}>No stations found</Text>
                <Text style={styles.emptyHint}>Try "Waterloo" or "Paddington"</Text>
              </View>
            }
          />
        </View>

        {/* Sticky Continue CTA with count and badge */}
        <View style={{
          position: 'absolute',
          bottom: insets.bottom + 16,
          left: 16,
          right: 16,
          zIndex: 10,
        }}>
          {pinnedStations.length > 0 && (
            <Text style={styles.ctaCountLabel}>
              {pinnedStations.length} station{pinnedStations.length !== 1 ? 's' : ''} added
            </Text>
          )}
          <View pointerEvents={canContinue ? 'auto' : 'none'}>
            <SpringPressable
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
              pressScale={0.97}
              accessibilityRole="button"
              accessibilityLabel={canContinue ? 'Continue to permissions' : 'Add at least one station to continue'}
              accessibilityState={{ disabled: !canContinue }}
              style={[
                styles.cta,
                {
                  backgroundColor: canContinue ? '#FFFFFF' : 'rgba(255,255,255,0.12)',
                  opacity: canContinue ? 1 : 0.35,
                },
              ]}
            >
              <View style={styles.ctaContent}>
                <Text style={[styles.ctaText, { color: canContinue ? '#0A0A0F' : TEXT_SKIP }]}>
                  Continue
                </Text>
                {canContinue && (
                  <View style={styles.arrowBadge}>
                    <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                  </View>
                )}
              </View>
            </SpringPressable>
          </View>
        </View>
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
  subtitle: {
    fontSize: 16,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: TEXT_SECONDARY,
    marginTop: 8,
  },
  lineDotsContainer: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  lineDotsExtra: { color: TEXT_SECONDARY, fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular' },
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
  chipScrollContainer: {
    gap: 8,
    alignItems: 'center',
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

  // Search bar — glass-bg-input per §1.1
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: SEARCH_BG,
    borderWidth: 1,
    borderColor: SEARCH_BORDER,
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
    marginBottom: 4,
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
    paddingTop: 100,
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

  // Sticky CTA
  ctaWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: 'rgba(13,11,23,0.92)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SEARCH_BORDER,
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
