// app/onboarding/stations.tsx — Screen 2: Station Search (v2)

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  withRepeat,
  cancelAnimation,
  Easing,
  runOnJS,
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
import { ProgressDots } from '../../components/ProgressDots';
import { StationCard } from '../../components/StationCard';
import { playSound } from '../../utils/sound';
import { usePressAnimation } from '../../hooks/usePressAnimation';
import { LINE_COLORS } from '../../constants/lineColors';
import { BlurView } from 'expo-blur';

const MAX_PINS = 5;
const RECENT_SEARCHES_KEY = 'recent_searches';

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);
const AnimatedIcon = Animated.createAnimatedComponent(Ionicons);

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
  const [ctaHeight, setCtaHeight] = useState(120);
  const measuredCtaHeight = useRef(120);

  const [isScrolled, setIsScrolled] = useState(false);
  const isScrolledRef = useRef(false);

  const canContinue = pinnedStations.length > 0;
  const backAnim = usePressAnimation('back_btn');
  const ctaBtnAnim = usePressAnimation('continue_btn', false);

  // Shake animation for max pins feedback
  const maxPinsShakeX = useSharedValue(0);
  const maxPinsShakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: maxPinsShakeX.value }],
  }));

  // Pulse animation for mock arrival dot
  const pulseOpacity = useSharedValue(0.4);
  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    return () => cancelAnimation(pulseOpacity);
  }, [pulseOpacity]);

  // Scroll value tracking for search bar transition
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
      const scrolled = event.contentOffset.y > 60;
      if (scrolled !== isScrolledRef.current) {
        isScrolledRef.current = scrolled;
        runOnJS(setIsScrolled)(scrolled);
      }
    },
  }, []);

  const ctaAnimValue = useSharedValue(1);

  useEffect(() => {
    ctaAnimValue.value = withTiming(isSearching ? 0 : 1, {
      duration: 200,
      easing: Easing.inOut(Easing.ease),
    });
  }, [isSearching, ctaAnimValue]);

  const ctaWrapAnimatedStyle = useAnimatedStyle(() => {
    return {
      height: interpolate(ctaAnimValue.value, [0, 1], [0, ctaHeight], 'clamp'),
      opacity: ctaAnimValue.value,
      paddingTop: interpolate(ctaAnimValue.value, [0, 1], [0, 14], 'clamp'),
      paddingBottom: interpolate(ctaAnimValue.value, [0, 1], [0, Math.max(insets.bottom, 16)], 'clamp'),
      borderTopColor: interpolateColor(
        ctaAnimValue.value,
        [0, 1],
        ['rgba(10,15,60,0)', 'rgba(10,15,60,0.10)']
      ),
    };
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
      hasCompletedOnboarding: true,
      onboardingStep: 3,
    });
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
    const t = interpolate(scrollY.value, [40, 80], [0, 1], 'clamp');
    return {
      backgroundColor: interpolateColor(
        t,
        [0, 1],
        ['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.85)']
      ),
      borderColor: interpolateColor(
        t,
        [0, 1],
        ['rgba(255, 255, 255, 0.12)', 'rgba(10, 15, 60, 0.08)']
      ),
      borderWidth: 0.5,
    };
  });

  const inputAnimatedStyle = useAnimatedStyle(() => {
    const t = interpolate(scrollY.value, [40, 80], [0, 1], 'clamp');
    return {
      color: interpolateColor(
        t,
        [0, 1],
        ['#FFFFFF', '#0A0F3C']
      ),
    };
  });

  const iconAnimatedStyle = useAnimatedStyle(() => {
    const t = interpolate(scrollY.value, [40, 80], [0, 1], 'clamp');
    return {
      color: interpolateColor(
        t,
        [0, 1],
        ['rgba(255, 255, 255, 0.60)', 'rgba(10, 15, 60, 0.45)']
      ),
    };
  });

  const renderStationItem = useCallback(({ item }: { item: TfLStation }) => {
    const isPinned = pinnedIds.has(item.id);
    const primaryLine = item.lines[0] || 'central';
    const primaryLineColor = LINE_COLORS[primaryLine] || '#888';

    // Right element: add plus icon or checkmark for search results
    const rightElement = (
      <View style={isPinned ? styles.addedCircle : styles.addCircle}>
        <Ionicons
          name={isPinned ? 'checkmark' : 'add'}
          size={12}
          color="#FFFFFF"
        />
      </View>
    );

    return (
      <StationCard
        station={item}
        primaryLineColor={primaryLineColor}
        rightElement={rightElement}
        onPress={() => handleToggleStation(item)}
      />
    );
  }, [pinnedIds, handleToggleStation]);

  const renderPinnedItem = useCallback(({ item }: { item: any }) => {
    const primaryLine = item.lines[0] || 'central';
    const primaryLineColor = LINE_COLORS[primaryLine] || '#888';

    // Right element: Mock arrival widget in onboarding
    const mockArrivalPill = (
      <View style={styles.arrivalPillContainer}>
        <View style={styles.arrivalPill}>
          <Animated.View style={[styles.pulseDot, { opacity: pulseOpacity }]} />
          <Text style={styles.arrivalPillText}>2 min</Text>
        </View>
        <Text style={styles.arrivalPillSub}>Live soon</Text>
      </View>
    );

    return (
      <StationCard
        station={item}
        primaryLineColor={primaryLineColor}
        rightElement={mockArrivalPill}
        onPress={() => handleToggleStation(item as TfLStation)}
      />
    );
  }, [pulseOpacity, handleToggleStation]);

  const stationCountLabel = `Search ${cleanFullStations.length} stations...`;

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
        <View style={[styles.navHeader, { paddingTop: insets.top + 8 }]}>
          <Pressable
            onPressIn={backAnim.onPressIn}
            onPressOut={backAnim.onPressOut}
            onPress={handleBack}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            accessibilityRole="button"
            accessibilityLabel="Go back to line selection"
            style={({ pressed }) => [
              styles.backButtonPressable,
              pressed && styles.backButtonPressed,
            ]}
          >
            <Animated.View style={[styles.navHeaderBtn, backAnim.animatedStyle]}>
              <Ionicons name="chevron-back" size={18} color="#FFFFFF" />
              <Text style={styles.navBackText}>Back</Text>
            </Animated.View>
          </Pressable>
        </View>

        {/* Title Header Container */}
        <View style={styles.headerContainer}>
          <Text style={styles.eyebrow}>SETUP · STEP 2 OF 2</Text>
          <ProgressDots total={2} current={2} />
          <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
            Your stations
          </Text>
        </View>

        {/* Search Bar sticky element */}
        <Animated.View style={[styles.searchBarContainer, searchBarAnimatedStyle]}>
          <AnimatedIcon name="search-outline" size={16} style={[styles.searchIcon, iconAnimatedStyle]} />
          <AnimatedTextInput
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setIsSearching(text.length > 0);
            }}
            placeholder={stationCountLabel}
            placeholderTextColor={isScrolled ? 'rgba(10,15,60,0.35)' : 'rgba(255,255,255,0.40)'}
            autoCorrect={false}
            autoCapitalize="none"
            style={[styles.searchInput, inputAnimatedStyle]}
          />
          {query.length > 0 && (
            <Pressable onPress={() => { setQuery(''); setIsSearching(false); }} hitSlop={8}>
              <AnimatedIcon name="close-circle" size={16} style={[styles.clearIcon, iconAnimatedStyle]} />
            </Pressable>
          )}
        </Animated.View>

        {/* Scrollable list content */}
        <Animated.FlatList
          data={isSearching ? results : pinnedStations.map(p => ({ id: p.id, name: p.name, lines: p.lineIds, zone: p.zone }))}
          renderItem={isSearching ? renderStationItem : renderPinnedItem}
          keyExtractor={(item) => item.id}
          initialNumToRender={12}
          windowSize={5}
          removeClippedSubviews={true}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          contentContainerStyle={[
            styles.listContainer,
            { paddingBottom: ctaHeight + 16 },
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
                <Text style={styles.emptyText}>Search for stations above</Text>
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

                    const rightBtn = (
                      <Pressable 
                        onPress={() => handleToggleStation(station)} 
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        style={styles.addCircle}
                      >
                        <Ionicons name="add" size={12} color="#FFFFFF" />
                      </Pressable>
                    );

                    return (
                      <View key={station.id} style={styles.recentRow}>
                        <StationCard
                          station={station}
                          primaryLineColor={primaryLineColor}
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
        <AnimatedBlurView 
          intensity={28}
          tint="light"
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > measuredCtaHeight.current) {
              measuredCtaHeight.current = h;
              setCtaHeight(h);
            }
          }}
          style={[
            styles.ctaWrap, 
            ctaWrapAnimatedStyle,
            { overflow: 'hidden' }
          ]}
          pointerEvents={isSearching ? 'none' : 'auto'}
        >
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
                  backgroundColor: canContinue ? '#0044EE' : 'rgba(10,15,60,0.07)',
                  borderColor: canContinue ? 'transparent' : 'rgba(10,15,60,0.18)',
                  borderWidth: canContinue ? 0 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.ctaText,
                  { color: canContinue ? '#FFFFFF' : 'rgba(10,15,60,0.35)' },
                ]}
              >
                {ctaLabel}
              </Text>
            </Animated.View>
          </Pressable>
          
          <Pressable onPress={handleSkip} style={styles.skipPressable}>
            <Text style={styles.skipText}>Skip for now</Text>
          </Pressable>
        </AnimatedBlurView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
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
  headerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
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
    marginTop: 10,
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
    color: 'rgba(255,255,255,0.40)',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  arrivalPillContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 8,
    padding: 4,
    maxWidth: 76,
  },
  arrivalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(22, 163, 74, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.30)',
    gap: 4,
    overflow: 'hidden',
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
  },
  arrivalPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16A34A',
    fontFamily: 'System',
  },
  arrivalPillSub: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(10,15,60,0.45)',
    marginTop: 2,
    fontFamily: 'System',
    textTransform: 'uppercase',
  },
  addCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(255,255,255,0.3)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  addedCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0044EE',
    borderWidth: 1,
    borderColor: 'rgba(0,68,238,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentsContainer: {
    marginTop: 20,
  },
  recentsTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.40)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 4,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
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
    paddingTop: 14,
    borderTopWidth: 1,
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
    color: 'rgba(10,15,60,0.45)',
    textDecorationLine: 'underline',
  },
  backButtonPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
  },
  backButtonPressed: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
});
