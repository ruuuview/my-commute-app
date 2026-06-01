// app/onboarding/stations.tsx — Screen 2: Station Search with Premium Custom Bottom Sheet Overlay (v4.6)

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, ScrollView,
  Pressable, Keyboard, useWindowDimensions, Image,
} from 'react-native';
import Animated, {
  FadeInDown, FadeIn, ZoomIn, ZoomOut, useSharedValue, useAnimatedStyle,
  withTiming, Easing, runOnJS, withSpring
} from 'react-native-reanimated';
import Fuse from 'fuse.js';

import * as Haptics from 'expo-haptics';
import {
  useFonts, SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useUserPreferencesStore } from '../../store/userPreferencesStore';
import { TfLStation, FULL_STATIONS } from '../../data/tflStations';
import { LinearGradient } from 'expo-linear-gradient';
import { useTapSound } from '../../hooks/useTapSound';
import { usePressAnimation } from '../../hooks/usePressAnimation';
import { playSound } from '../../utils/sound';
import DepartureCard from '../../components/DepartureCard';
import ProgressDots from '../../components/ProgressDots';
import { SCREEN_2_BACKGROUND_GRADIENT, DASHBOARD_OVERLAY_GRADIENT } from '../../theme/colors';

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_PINS = 5;
const ROW_HEIGHT = 64;

// ─── Locked Design Tokens ─────────────────────────────────────────────────────

const TEXT_PRIMARY   = 'rgba(255,255,255,0.9)';
const TEXT_SECONDARY = 'rgba(255,255,255,0.4)';
const TEXT_GHOST     = 'rgba(255,255,255,0.3)';
const TEXT_SKIP      = 'rgba(255,255,255,0.35)';
const ROW_ADDED_BG   = 'rgba(255,255,255,0.06)';
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
  const { playSelect, playDeselect } = useTapSound();
  
  const pinnedStations = useOnboardingStore(s => s.pinnedStations);
  const addStation = useOnboardingStore(s => s.addStation);
  const removeStation = useOnboardingStore(s => s.removeStation);
  const selectedLines = useOnboardingStore(s => s.selectedLines);

  const [query, setQuery] = useState('');
  const inputRef = useRef<TextInput>(null);

  // Trigger Error feedback when search returns 0 results

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
      keys: ['name', 'searchKeys'],
      threshold: 0.35,
      distance: 100,
      ignoreLocation: false,
      includeScore: true,
      shouldSort: true,
    });

    const cleanQuery = query
      .replace(/'/g, '')
      .replace(/\./g, '')
      .toLowerCase()
      .trim();
    const searchResults = fuse.search(cleanQuery);

    return searchResults
      .filter((r) => (r.score ?? 1) < 0.35)
      .sort((a, b) => {
        const q = cleanQuery;
        const aStarts = a.item.name.toLowerCase().replace(/'/g, '').replace(/\./g, '').startsWith(q);
        const bStarts = b.item.name.toLowerCase().replace(/'/g, '').replace(/\./g, '').startsWith(q);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return (a.score ?? 1) - (b.score ?? 1);
      })
      .map((r) => r.item);
  }, [query, popularStations, cleanFullStations]);

  useEffect(() => {
    if (query.trim() && results.length === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      playSound('error');
    }
  }, [results.length, query]);

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

  const handleSearchResultTap = useCallback((station: TfLStation) => {
    handleRowTap(station);
    setQuery('');
  }, [handleRowTap]);


  // Shared-axis slide transitions
  const { width } = useWindowDimensions();
  const transitionX = useSharedValue(width * 0.55);
  const transitionScale = useSharedValue(0.96);
  const transitionOpacity = useSharedValue(0);
  const reducedMotion = false; // Force false to override system-level 'Reduce Motion' and ensure transitions slide/scale!

  useFocusEffect(
    useCallback(() => {
      const dir = useOnboardingStore.getState().navigationDirection;
      if (dir === 'forward') {
        transitionX.value = width * 0.55;
        transitionScale.value = 0.96;
        transitionOpacity.value = 0;
      } else {
        transitionX.value = 0;
        transitionScale.value = 1;
        transitionOpacity.value = 1;
        return;
      }

      if (reducedMotion) {
        transitionX.value = 0;
        transitionScale.value = 1;
        transitionOpacity.value = 1;
        return;
      }

      transitionX.value = withTiming(0, {
        duration: 320,
        easing: Easing.out(Easing.poly(4)),
      });
      transitionScale.value = withTiming(1.0, {
        duration: 320,
        easing: Easing.out(Easing.poly(4)),
      });
      transitionOpacity.value = withTiming(1, {
        duration: 320,
        easing: Easing.out(Easing.poly(4)),
      });
    }, [width, reducedMotion, transitionOpacity, transitionScale, transitionX])
  );

  const slideStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: transitionX.value },
      { scale: transitionScale.value }
    ],
    opacity: transitionOpacity.value,
  }));

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playSound('pop', 0.32); // Backward screen pop sound

    useOnboardingStore.getState().setNavigationDirection('backward');

    if (reducedMotion) {
      router.back();
      return;
    }

    transitionX.value = withTiming(width * 0.55, {
      duration: 320,
      easing: Easing.out(Easing.poly(4)),
    });
    transitionScale.value = withTiming(0.96, {
      duration: 320,
      easing: Easing.out(Easing.poly(4)),
    });
    transitionOpacity.value = withTiming(0, {
      duration: 320,
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

  // Hook mappings to consume physical configs per specifications
  const backAnim = usePressAnimation('back_btn');
  const skipAnim = usePressAnimation('skip_btn');
  const zeroStateBtnAnim = usePressAnimation('continue_btn');
  const ctaBtnAnim = usePressAnimation('continue_btn', !canContinue);
  const doneButtonOpacity = useSharedValue(pinnedStations.length > 0 ? 1 : 0);


  useEffect(() => {
    doneButtonOpacity.value = withSpring(pinnedStations.length > 0 ? 1 : 0, {
      damping: 14,
      stiffness: 180,
    });
  }, [pinnedStations.length, doneButtonOpacity]);

  const doneButtonStyle = useAnimatedStyle(() => {
    return {
      opacity: doneButtonOpacity.value,
      transform: [
        { scale: withSpring(pinnedStations.length > 0 ? 1 : 0.9, { damping: 14, stiffness: 180 }) }
      ],
    };
  });

  if (!fontsLoaded) return null;


  return (
    <Pressable style={styles.flex1} onPress={() => Keyboard.dismiss()}>
      <View style={styles.flex1}>
        <LinearGradient
          colors={SCREEN_2_BACKGROUND_GRADIENT.colors}
          locations={SCREEN_2_BACKGROUND_GRADIENT.locations}
          start={SCREEN_2_BACKGROUND_GRADIENT.start}
          end={SCREEN_2_BACKGROUND_GRADIENT.end}
          style={StyleSheet.absoluteFillObject}
        />
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
              <Text style={styles.subtitle} allowFontScaling maxFontSizeMultiplier={1.4}>
                {"Search, tap, done."}
              </Text>
            </View>

            {/* Search Bar */}
            <View style={styles.searchBarContainer}>
              <View style={styles.searchWrap}>
                <Ionicons name="search-outline" size={16} color={TEXT_SECONDARY} style={styles.searchIcon} />
                <TextInput
                  ref={inputRef}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search 471 stations..."
                  placeholderTextColor={TEXT_SKIP}
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


            {/* Live Departure Cards for Pinned Stations */}
            {pinnedStations.length > 0 ? (
              <Animated.View
                entering={FadeInDown.springify().damping(15)}
                style={{
                  paddingHorizontal: 16,
                  marginTop: query.length > 0 ? 0 : 20,
                  gap: query.length > 0 ? 0 : 12,
                }}
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
                    isEditing={false}
                    autoExpand={false}
                    hideCard={query.length > 0}
                  />
                ))}
              </Animated.View>
            ) : (
              /* Premium Dashboard Zero State when no stations are pinned */
              query.length === 0 && (
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
                    onPress={() => inputRef.current?.focus()}
                  >
                    <Animated.View style={[styles.zeroStateBtn, zeroStateBtnAnim.animatedStyle]}>
                      <Text style={styles.zeroStateBtnText}>Search Stations</Text>
                      <Ionicons name="search" size={14} color="#0A0A0F" />
                    </Animated.View>
                  </Pressable>
                </Animated.View>
              )
            )}

            {/* Search Results (Visible only when searching) */}
            {query.length > 0 && (
              <Animated.View
                entering={FadeIn.duration(200)}
                style={{ paddingHorizontal: 16, marginTop: 12 }}
              >
                <Text style={styles.sectionLabel}>{resultCountText}</Text>
                
                {results.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="search-outline" size={28} color={TEXT_GHOST} />
                    <Text style={styles.emptyText}>No stations found</Text>
                    <Text style={styles.emptyHint}>Try &quot;Waterloo&quot; or &quot;Paddington&quot;</Text>
                  </View>
                ) : (
                  results.slice(0, 10).map((station) => (
                    <StationRow
                      key={station.id}
                      station={station}
                      isPinned={pinnedIds.has(station.id)}
                      onTap={handleSearchResultTap}
                    />
                  ))
                )}
              </Animated.View>
            )}
          </ScrollView>

          {/* Sticky CTA Footer Container */}
          <Animated.View
            pointerEvents={pinnedStations.length > 0 ? 'auto' : 'none'}
            style={[
              styles.ctaFooterContainer,
              { bottom: insets.bottom + 16 },
              doneButtonStyle
            ]}
          >
            {/* Main Continue button */}
            <Pressable
              onPressIn={ctaBtnAnim.onPressIn}
              onPressOut={ctaBtnAnim.onPressOut}
              onPress={async () => {
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

                if (mappedStations.length > 0) {
                  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  playSound('confirm');
                } else {
                  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }

                useUserPreferencesStore.getState().completeOnboarding();
              }}
              accessibilityRole="button"
              accessibilityLabel="Continue to permissions"
            >
              <Animated.View
                style={[
                  styles.cta,
                  ctaBtnAnim.animatedStyle,
                  {
                    backgroundColor: '#FFFFFF',
                  },
                ]}
              >
                <View style={styles.ctaContent}>
                  <Text style={[styles.ctaText, { color: '#0A0A0F' }]}>
                    Continue ({pinnedStations.length} added)
                  </Text>
                  <View style={styles.arrowBadge}>
                    <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                  </View>
                </View>
              </Animated.View>
            </Pressable>
          </Animated.View>
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
  searchBarContainer: {
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 14,
    height: 48,
  },

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
    color: 'rgba(255,255,255,0.60)',
    marginTop: 4,
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

});
