// app/onboarding/stations.tsx — Screen 2: Station Search (v2)

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  interpolate,
  interpolateColor,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Fuse from 'fuse.js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useUserPreferencesStore } from '../../store/userPreferencesStore';
import { TfLStation, FULL_STATIONS } from '../../data/tflStations';
import { OnboardingGradient } from '../../components/OnboardingGradient';
import { ProgressPips } from '../../components/ProgressPips';
import { StationCard } from '../../components/StationCard';
import { playSound } from '../../utils/sound';
import { usePressAnimation } from '../../hooks/usePressAnimation';

const MAX_PINS = 5;
const RECENT_SEARCHES_KEY = 'recent_searches';

// Line color map for left accent bar
const LINE_COLORS: Record<string, string> = {
  bakerloo: '#B36305', central: '#E32017', circle: '#FFD300',
  district: '#00782A', dlr: '#00AFAD', elizabeth: '#6950A1',
  'hammersmith-city': '#F3A9BB', jubilee: '#A0A5A9', metropolitan: '#9B0056',
  northern: '#1A1A1A', overground: '#EE7C0E', piccadilly: '#003688',
  victoria: '#0098D4', 'waterloo-city': '#95CDBA',
};

const LINE_NAMES: Record<string, string> = {
  bakerloo: 'Bakerloo', central: 'Central', circle: 'Circle',
  district: 'District', dlr: 'DLR', elizabeth: 'Elizabeth',
  'hammersmith-city': 'Hammersmith & City', jubilee: 'Jubilee', metropolitan: 'Metropolitan',
  northern: 'Northern', overground: 'Overground', piccadilly: 'Piccadilly',
  victoria: 'Victoria', 'waterloo-city': 'Waterloo & City',
};

export default function StationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const pinnedStations = useOnboardingStore(s => s.pinnedStations);
  const addStation = useOnboardingStore(s => s.addStation);
  const removeStation = useOnboardingStore(s => s.removeStation);
  const selectedLines = useOnboardingStore(s => s.selectedLines);

  const [query, setQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<TfLStation[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [maxPinsToast, setMaxPinsToast] = useState(false);

  const canContinue = pinnedStations.length > 0;
  const backAnim = usePressAnimation('back_btn');
  const ctaBtnAnim = usePressAnimation('continue_btn', false);

  // Shake animation for max pins feedback
  const maxPinsShakeX = useSharedValue(0);
  const maxPinsShakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: maxPinsShakeX.value }],
  }));

  // Scroll value tracking for search bar transition
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  // Load search history from AsyncStorage
  useEffect(() => {
    async function loadRecents() {
      try {
        const val = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
        if (val) {
          setRecentSearches(JSON.parse(val));
        }
      } catch (err) {
        console.log('Error loading recents:', err);
      }
    }
    loadRecents();
  }, []);

  // Save new search item to AsyncStorage
  const saveToRecents = useCallback(async (station: TfLStation) => {
    try {
      const filtered = recentSearches.filter(s => s.id !== station.id);
      const updated = [station, ...filtered].slice(0, 3);
      setRecentSearches(updated);
      await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch (err) {
      console.log('Error saving recents:', err);
    }
  }, [recentSearches]);

  // Deduplicate and filter full station list once
  const cleanFullStations = useMemo(() => {
    const map: Record<string, TfLStation> = {};
    for (const st of FULL_STATIONS) {
      const key = st.name.toLowerCase().trim();
      if (!map[key]) {
        map[key] = st;
      }
    }
    return Object.values(map);
  }, []);

  // Filter popular stations based on selected lines
  const popularStations = useMemo(() => {
    const POPULAR_NAMES = ['bank', 'canary wharf', "king's cross st. pancras", 'waterloo', 'liverpool street'];
    const filtered = cleanFullStations.filter(st => {
      const stName = st.name.toLowerCase();
      return POPULAR_NAMES.some(pName => stName.includes(pName));
    });
    return filtered.filter(st => st.lines.some(l => selectedLines.includes(l)));
  }, [selectedLines, cleanFullStations]);

  // Fuse search index — memoised on data, not on query
  const fuse = useMemo(
    () => new Fuse(cleanFullStations, { keys: ['name'], threshold: 0.3, distance: 100 }),
    [cleanFullStations]
  );

  // Search results — only calls fuse.search() per keystroke, doesn't rebuild index
  const results = useMemo<TfLStation[]>(() => {
    if (!query.trim()) return popularStations;
    return fuse.search(query.toLowerCase().trim()).map(r => r.item);
  }, [query, popularStations, fuse]);

  // Haptic feedback on zero search results
  useEffect(() => {
    if (query.trim() && results.length === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      playSound('error');
    }
  }, [results.length, query]);

  const pinnedIds = useMemo(() => new Set(pinnedStations.map(p => p.id)), [pinnedStations]);

  // Filtered recent searches (not already pinned)
  const unpinnedRecentSearches = useMemo(() => {
    return recentSearches.filter(s => !pinnedIds.has(s.id));
  }, [recentSearches, pinnedIds]);

  const handleToggleStation = useCallback(
    async (station: TfLStation) => {
      const isPinned = pinnedIds.has(station.id);
      if (isPinned) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        removeStation(station.id);
      } else {
        if (pinnedStations.length >= MAX_PINS) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          // Shake counter + flash toast so user sees why tap was blocked
          maxPinsShakeX.value = withSequence(
            withTiming(-8, { duration: 60, easing: Easing.linear }),
            withTiming(8, { duration: 60, easing: Easing.linear }),
            withTiming(-6, { duration: 60, easing: Easing.linear }),
            withTiming(6, { duration: 60, easing: Easing.linear }),
            withTiming(0, { duration: 60, easing: Easing.linear })
          );
          setMaxPinsToast(true);
          setTimeout(() => setMaxPinsToast(false), 1500);
          return;
        }
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        addStation({
          id: station.id,
          name: station.name,
          lineIds: station.lines,
          zone: station.zone ?? 1,
        });
        saveToRecents(station);
      }
    },
    [pinnedIds, pinnedStations, addStation, removeStation, saveToRecents, maxPinsShakeX]
  );

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playSound('pop', 0.32);
    useOnboardingStore.getState().setNavigationDirection('backward');
    router.back();
  };

  const handleCTAPress = async () => {
    if (pinnedStations.length === 0) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    
    // Success haptic
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    playSound('confirm');

    // Build preferences array for next tab stack
    const mappedStations = pinnedStations.map((station, index) => ({
      id: station.id,
      name: station.name,
      lines: station.lineIds,
      role: index === 0 ? ('home' as const) : index === 1 ? ('work' as const) : ('other' as const),
    }));

    useUserPreferencesStore.setState({
      selectedLines,
      pinnedStations: mappedStations,
    });

    useUserPreferencesStore.getState().completeOnboarding();
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    useUserPreferencesStore.getState().completeOnboarding();
  };

  const ctaLabel = pinnedStations.length === 0
    ? 'Add at least one station'
    : pinnedStations.length === 1
    ? 'Continue with 1 station'
    : `Continue with ${pinnedStations.length} stations`;

  // Search bar styles mapped to scrollY
  const searchBarAnimatedStyle = useAnimatedStyle(() => {
    const t = interpolate(scrollY.value, [280, 320], [0, 1], 'clamp');
    return {
      backgroundColor: interpolateColor(
        t,
        [0, 1],
        ['rgba(255, 255, 255, 0.10)', '#FFFFFF']
      ),
      borderColor: interpolateColor(
        t,
        [0, 1],
        ['rgba(255, 255, 255, 0.20)', 'rgba(10, 15, 60, 0.08)']
      ),
      borderWidth: 0.5,
    };
  });

  const renderStationItem = ({ item }: { item: TfLStation }) => {
    const isPinned = pinnedIds.has(item.id);
    const primaryLine = item.lines[0] || 'central';
    const primaryLineColor = LINE_COLORS[primaryLine] || '#888';
    const primaryLineName = LINE_NAMES[primaryLine] || 'Tube';

    // Right element: add plus icon or checkmark for search results
    const rightElement = (
      <View style={isPinned ? styles.addedCircle : styles.addCircle}>
        <Ionicons
          name={isPinned ? 'checkmark' : 'add'}
          size={12}
          color={isPinned ? '#FFFFFF' : 'rgba(10,15,60,0.50)'}
        />
      </View>
    );

    return (
      <StationCard
        station={item}
        primaryLineColor={primaryLineColor}
        primaryLineName={primaryLineName}
        rightElement={rightElement}
        onPress={() => handleToggleStation(item)}
      />
    );
  };

  const stationCountLabel = `Search ${cleanFullStations.length} stations...`;

  // Render headers
  const listHeader = () => (
    <View style={styles.listHeaderContainer}>
      <Text style={styles.eyebrow}>SETUP · STEP 2 OF 2</Text>
      <ProgressPips total={2} current={2} />
      <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
        Your stations
      </Text>
      <Text 
        style={styles.subtitle} 
        accessibilityElementsHidden={true} 
        allowFontScaling 
        maxFontSizeMultiplier={1.4}
      >
        Pin stops you use most
      </Text>
    </View>
  );

  return (
    <View style={styles.root}>
      <OnboardingGradient />

      {/* Stack Screen configurations */}
      <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />

      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        {/* Navigation header fixed crown area */}
        <View style={[styles.navHeader, { paddingTop: insets.top + 8, height: insets.top + 44 + 8 }]}>
          <Pressable
            onPressIn={backAnim.onPressIn}
            onPressOut={backAnim.onPressOut}
            onPress={handleBack}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            accessibilityRole="button"
            accessibilityLabel="Go back to line selection"
          >
            <Animated.View style={[styles.navHeaderBtn, backAnim.animatedStyle]}>
              <Ionicons name="chevron-back" size={18} color="#FFFFFF" />
              <Text style={styles.navBackText}>Back</Text>
            </Animated.View>
          </Pressable>
        </View>

        {/* Search Bar sticky element */}
        <Animated.View style={[styles.searchBarContainer, searchBarAnimatedStyle]}>
          <Ionicons name="search-outline" size={16} color="rgba(10,15,60,0.45)" style={styles.searchIcon} />
          <TextInput
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setIsSearching(text.length > 0);
            }}
            placeholder={stationCountLabel}
            placeholderTextColor="rgba(10,15,60,0.35)"
            autoCorrect={false}
            autoCapitalize="none"
            style={styles.searchInput}
          />
          {query.length > 0 && (
            <Pressable onPress={() => { setQuery(''); setIsSearching(false); }} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color="rgba(10,15,60,0.45)" style={styles.clearIcon} />
            </Pressable>
          )}
        </Animated.View>

        {/* Scrollable list content */}
        <Animated.FlatList
          data={isSearching ? results : pinnedStations.map(p => ({ id: p.id, name: p.name, lines: p.lineIds, zone: p.zone }))}
          renderItem={isSearching ? renderStationItem : ({ item }) => {
            const primaryLine = item.lines[0] || 'central';
            const primaryLineColor = LINE_COLORS[primaryLine] || '#888';
            const primaryLineName = LINE_NAMES[primaryLine] || 'Tube';

            // Right element: Static Live badge in onboarding
            const liveBadge = (
              <View style={styles.liveBadge}>
                <Text style={styles.liveBadgeText}>Live</Text>
              </View>
            );

            return (
              <StationCard
                station={item}
                primaryLineColor={primaryLineColor}
                primaryLineName={primaryLineName}
                rightElement={liveBadge}
                onPress={() => handleToggleStation(item as TfLStation)}
              />
            );
          }}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={listHeader}
          initialNumToRender={12}
          windowSize={5}
          removeClippedSubviews={true}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          contentContainerStyle={[
            styles.listContainer,
            { paddingBottom: 24 },
          ]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={() => {
            if (isSearching) {
              return (
                <View style={styles.emptyState}>
                  <Ionicons name="search-outline" size={32} color="rgba(10,15,60,0.25)" />
                  <Text style={styles.emptyText}>No stations found</Text>
                </View>
              );
            }

            // Zero Pinned State
            return (
              <View style={styles.emptyState}>
                <Ionicons name="location-outline" size={32} color="rgba(10,15,60,0.25)" />
                <Text style={styles.emptyText}>Search above to add your first station</Text>
              </View>
            );
          }}
          ListFooterComponent={() => {
            // Guarded Recent Searches (only show if not searching, and history has unpinned items)
            if (!isSearching && unpinnedRecentSearches.length > 0) {
              return (
                <View style={styles.recentsContainer}>
                  <Text style={styles.recentsTitle}>RECENT SEARCHES</Text>
                  {unpinnedRecentSearches.map(station => {
                    const primaryLine = station.lines[0] || 'central';
                    const primaryLineColor = LINE_COLORS[primaryLine] || '#888';
                    const primaryLineName = LINE_NAMES[primaryLine] || 'Tube';

                    const rightBtn = (
                      <Pressable 
                        onPress={() => handleToggleStation(station)} 
                        hitSlop={8}
                        style={styles.addCircle}
                      >
                        <Ionicons name="add" size={12} color="rgba(10,15,60,0.50)" />
                      </Pressable>
                    );

                    return (
                      <View key={station.id} style={styles.recentRow}>
                        <StationCard
                          station={station}
                          primaryLineColor={primaryLineColor}
                          primaryLineName={primaryLineName}
                          rightElement={rightBtn}
                          onPress={() => handleToggleStation(station)}
                        />
                      </View>
                    );
                  })}
                </View>
              );
            }
            return null;
          }}
        />

        {/* Footer CTA — flex child, not absolute, so Android KAV can push it up */}
        <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + 16 }]}>
          {/* Max pins toast nudge — always visible above CTA */}
          {maxPinsToast && (
            <Animated.View style={[styles.maxPinsToast, maxPinsShakeStyle]}>
              <Text style={styles.maxPinsToastText}>Maximum {MAX_PINS} stations</Text>
            </Animated.View>
          )}

          <Pressable
            onPress={handleCTAPress}
            onPressIn={ctaBtnAnim.onPressIn}
            onPressOut={ctaBtnAnim.onPressOut}
            style={styles.ctaPressable}
          >
            <Animated.View
              style={[
                styles.cta,
                ctaBtnAnim.animatedStyle,
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
            <Text style={styles.skipText}>Skip for now</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ECEFFE',
  },
  flex1: {
    flex: 1,
  },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  navHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navBackText: {
    fontFamily: 'System',
    fontSize: 13,
    color: 'rgba(255,255,255,0.70)',
    marginLeft: 4,
  },
  listHeaderContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
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
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 0.5,
    zIndex: 10,
  },
  searchIcon: {
    marginRight: 8,
  },
  clearIcon: {
    marginLeft: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0A0F3C',
    height: '100%',
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    color: 'rgba(10,15,60,0.40)',
    textAlign: 'center',
  },
  liveBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(22, 163, 74, 0.12)',
  },
  liveBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16A34A',
  },
  addCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(10,20,100,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addedCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#0044EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentsContainer: {
    marginTop: 20,
  },
  recentsTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(10,15,60,0.30)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 4,
  },
  recentRow: {},
  maxPinsToast: {
    backgroundColor: 'rgba(220, 38, 38, 0.12)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  maxPinsToastText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  ctaWrap: {
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
