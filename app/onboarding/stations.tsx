// app/onboarding/stations.tsx — Screen 2: Station Search (v4.5 §4.3 + §17.5)

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, ScrollView,
  Pressable, KeyboardAvoidingView, Platform, Keyboard, useWindowDimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeInDown, FadeOutLeft } from 'react-native-reanimated';
import { useSharedValue, useAnimatedStyle, withSequence, withSpring } from 'react-native-reanimated';
import Fuse from 'fuse.js';
import * as Haptics from 'expo-haptics';
import {
  useFonts, SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useUserPreferencesStore } from '../../store/userPreferencesStore';
import { TfLStation, FULL_STATIONS } from '../../data/tflStations';
import VoidBackground, { VOID_ROOT_COLOR } from '../../components/VoidBackground';
import BouncyPressable from '../../components/BouncyPressable';
import ProgressDots from '../../components/ProgressDots';
import { LinearGradient } from 'expo-linear-gradient';

// ─── Constants ────────────────────────────────────────────────────────────────
const STATION_SEARCH_PLACEHOLDER = 'Search 471 stations...';
const MAX_PINS = 5;
const ROW_HEIGHT = 64;

// ─── Option C Gradient Tokens ────────────────────────────────────────────────
const ONBOARDING_GRADIENT = {
  colors: ['#070714', '#0A1128', '#001040', '#000810'] as const,
  locations: [0, 0.38, 0.65, 1] as const,
  start: { x: 0.2, y: 0 },
  end: { x: 0.8, y: 1 },
};

// ─── Line colour map for dots in search results ───────────────────────────────
const LINE_COLORS: Record<string, string> = {
  bakerloo: '#B36305', central: '#E32017', circle: '#FFD300',
  district: '#00782A', dlr: '#00AFAD', elizabeth: '#6950A1',
  'hammersmith-city': '#F3A9BB', jubilee: '#A0A5A9', metropolitan: '#9B0056',
  northern: '#3A3A3C', overground: '#EE7C0E', piccadilly: '#003688',
  victoria: '#0098D4', 'waterloo-city': '#95CDBA',
};

// ─── Helper: Group & Deduplicate Station Lists by Name ────────────────────────
const cleanAndDeduplicate = (rawStations: TfLStation[]): TfLStation[] => {
  const map: Record<string, TfLStation> = {};
  for (const st of rawStations) {
    const cleanName = st.name.replace(/ Underground Station$/i, '').trim();
    const key = cleanName.toLowerCase();
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
  const shown = lines.slice(0, 4);
  const extra = lines.length - 4;
  return (
    <View style={styles.lineDotsContainer}>
      {shown.map(l => (
        <View
          key={l}
          style={{
            width: 10, height: 10, borderRadius: 5,
            backgroundColor: l === 'elizabeth' ? 'rgb(106, 16, 153)' : (LINE_COLORS[l] ?? '#888'),
            borderWidth: l === 'northern' || l === 'circle' || l === 'elizabeth' ? 0.5 : 0,
            borderColor: 'rgba(255,255,255,0.4)',
          }}
        />
      ))}
      {extra > 0 && (
        <Text style={styles.lineDotsExtra}>
          +{extra}
        </Text>
      )}
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
  const scale = useSharedValue(1);

  useEffect(() => {
    if (isPinned) {
      scale.value = withSequence(
        withSpring(1.15, { damping: 10, stiffness: 200 }),
        withSpring(1.0, { damping: 15, stiffness: 300 })
      );
    } else {
      scale.value = 1;
    }
  }, [isPinned]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={() => onTap(station)}
      style={({ pressed }) => [
        styles.row,
        isPinned && styles.rowAdded,
        pressed && { opacity: 0.7 },
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
      
      <Animated.View style={animStyle}>
        {isPinned ? (
          <View style={styles.addedCircle}>
            <Ionicons name="checkmark" size={14} color="#0A0A0F" />
          </View>
        ) : (
          <View style={styles.addCircle}>
            <Ionicons name="add" size={14} color="rgba(255,255,255,0.7)" />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
});

// ─── Screen Component ──────────────────────────────────────────────────────────
export default function StationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  
  const pinnedStations = useUserPreferencesStore(s => s.pinnedStations);
  const pinStation = useUserPreferencesStore(s => s.pinStation);
  const unpinStation = useUserPreferencesStore(s => s.unpinStation);
  const selectedLines = useUserPreferencesStore((s: any) => s.selectedLines || []);

  const [query, setQuery] = useState('');
  const inputRef = useRef<TextInput>(null);

  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold,
  });

  const isAtLimit = pinnedStations.length >= MAX_PINS;
  const canContinue = pinnedStations.length > 0;

  // 1. Deduplicate full station list (memoized once)
  const cleanFullStations = useMemo(() => cleanAndDeduplicate(FULL_STATIONS), []);

  // 2. Compute popular stations dynamically, filtered to overlap with selectedLines
  const popularStations = useMemo(() => {
    const POPULAR_NAMES = ['Bank', 'Canary Wharf', "King's Cross St Pancras", 'Waterloo', 'Liverpool Street'];
    const filteredPopular = cleanFullStations.filter(st => 
      POPULAR_NAMES.some(name => st.name.toLowerCase() === name.toLowerCase())
    );
    filteredPopular.sort((a, b) => 
      POPULAR_NAMES.indexOf(a.name) - POPULAR_NAMES.indexOf(b.name)
    );
    return filteredPopular.filter(st => 
      st.lines.some(l => selectedLines.includes(l))
    );
  }, [selectedLines, cleanFullStations]);

  // 3. Memoized Search results using dynamic threshold formula
  const results = useMemo<TfLStation[]>(() => {
    if (!query.trim()) return popularStations;

    const dynamicThreshold = Math.max(0.2, 0.5 - query.length * 0.05);

    const fuse = new Fuse(cleanFullStations, {
      keys: ['name'],
      threshold: dynamicThreshold,
      includeScore: true,
    });

    return fuse.search(query).map(r => r.item);
  }, [query, popularStations, cleanFullStations]);

  // 4. Instant Selection Toggle with Haptics (No Bottom Sheet)
  const handleRowTap = useCallback((station: TfLStation) => {
    const isPinned = pinnedStations.some(p => p.id === station.id);
    if (isPinned) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      unpinStation(station.id);
    } else {
      if (pinnedStations.length >= MAX_PINS) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      pinStation(station, 'other');
    }
  }, [pinnedStations, pinStation, unpinStation]);

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
    router.back();
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/onboarding/permissions');
  };

  const resultCountText = useMemo(() => {
    if (!query.trim()) return 'Popular stations';
    const count = results.length;
    if (count > 10) return `Showing top 10 of ${count}`;
    return `${count} result${count !== 1 ? 's' : ''}`;
  }, [query, results]);

  if (!fontsLoaded) return null;

  return (
    <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={styles.flex1} onPress={() => Keyboard.dismiss()}>
        <LinearGradient
          colors={ONBOARDING_GRADIENT.colors}
          locations={ONBOARDING_GRADIENT.locations}
          start={ONBOARDING_GRADIENT.start}
          end={ONBOARDING_GRADIENT.end}
          style={styles.flex1}
        >
          <VoidBackground />
          <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />

          {/* Navigation & Progress Header */}
          <View style={[styles.navHeader, { paddingTop: insets.top + 8 }]}>
            <Pressable
              onPress={handleBack}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              style={styles.navHeaderBtn}
              accessibilityRole="button"
              accessibilityLabel="Go back to line selection"
            >
              <Ionicons name="chevron-back" size={20} color="rgba(255,255,255,0.9)" />
              <Text style={styles.navBackText}>Back</Text>
            </Pressable>

            <ProgressDots currentStep={1} totalSteps={3} style={styles.navProgressDots} />

            <Pressable
              onPress={handleSkip}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              style={styles.navHeaderBtnRight}
              accessibilityRole="button"
              accessibilityLabel="Skip station selection"
            >
              <Text style={styles.navSkipText}>Skip</Text>
            </Pressable>
          </View>

          {/* Header Title */}
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={2} allowFontScaling maxFontSizeMultiplier={1.3}>
              {'Which stations\ndo you use?'}
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
            <Animated.View entering={FadeInDown} style={styles.chipScrollWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipScrollContainer}
              >
                {pinnedStations.map((station) => (
                  <Animated.View
                    key={station.id}
                    exiting={FadeOutLeft}
                    style={styles.pinnedChip}
                  >
                    <Ionicons name="checkmark" size={12} color="rgba(255,255,255,0.9)" style={{ marginRight: 4 }} />
                    <Text style={styles.pinnedChipText} numberOfLines={1}>
                      {station.name}
                    </Text>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        unpinStation(station.id);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.chipRemoveBtn}
                    >
                      <Ionicons name="close" size={14} color="rgba(255,255,255,0.6)" />
                    </Pressable>
                  </Animated.View>
                ))}
              </ScrollView>
            </Animated.View>
          )}

          {/* Search bar */}
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={16} color="rgba(255,255,255,0.50)" style={styles.searchIcon} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              placeholder={STATION_SEARCH_PLACEHOLDER}
              placeholderTextColor="rgba(255,255,255,0.35)"
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
                <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.50)" style={styles.clearIcon} />
              </Pressable>
            )}
          </View>

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
              contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons name="search-outline" size={28} color="rgba(255,255,255,0.25)" />
                  <Text style={styles.emptyText}>No stations found</Text>
                  <Text style={styles.emptyHint}>Try "Waterloo" or "Paddington"</Text>
                </View>
              }
            />
          </View>

          {/* Sticky Continue CTA with count and badge */}
          <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + 16 }]}>
            {pinnedStations.length > 0 && (
              <Text style={styles.ctaCountLabel}>
                {pinnedStations.length} station{pinnedStations.length !== 1 ? 's' : ''} added
              </Text>
            )}
            <BouncyPressable
              onPress={async () => {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/onboarding/permissions');
              }}
              disabled={!canContinue}
              accessibilityRole="button"
              accessibilityLabel={canContinue ? 'Continue to permissions' : 'Add at least one station to continue'}
              accessibilityState={{ disabled: !canContinue }}
              style={[
                styles.cta,
                {
                  backgroundColor: canContinue ? '#FFFFFF' : 'rgba(255,255,255,0.12)',
                  opacity: canContinue ? 1 : 0.4,
                },
              ]}
            >
              <View style={styles.ctaContent}>
                <Text style={[styles.ctaText, { color: canContinue ? '#0A0A0F' : 'rgba(255,255,255,0.35)' }]}>
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
        </LinearGradient>
      </Pressable>
    </KeyboardAvoidingView>
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
    color: 'rgba(255,255,255,0.95)',
    letterSpacing: -0.5,
    lineHeight: 38,
  },
  lineDotsContainer: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lineDotsExtra: { color: 'rgba(255,255,255,0.50)', fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular' },
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
    color: 'rgba(255,255,255,0.9)',
    marginLeft: 2,
  },
  navSkipText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 14,
    color: 'rgba(255,255,255,0.35)',
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
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pinnedChipText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
  },
  chipRemoveBtn: {
    marginLeft: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Search bar — glass-bg-input per §1.1
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    height: 48,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 10,
    height: '100%',
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255,255,255,0.45)',
    paddingHorizontal: 16,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // Result row — fixed 64pt
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  rowAdded: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  rowName: {
    fontSize: 15,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: 'rgba(255,255,255,0.9)',
  },
  rowZone: {
    fontSize: 11,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255,255,255,0.4)',
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
  emptyState: { alignItems: 'center', paddingTop: 48, gap: 8 },
  emptyText: { fontSize: 15, fontFamily: 'SpaceGrotesk_700Bold', color: 'rgba(255,255,255,0.5)', textAlign: 'center' },
  emptyHint: { fontSize: 12, fontFamily: 'SpaceGrotesk_400Regular', color: 'rgba(255,255,255,0.3)', textAlign: 'center' },

  // Sticky CTA
  ctaWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: 'rgba(13,11,23,0.92)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  ctaCountLabel: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
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
