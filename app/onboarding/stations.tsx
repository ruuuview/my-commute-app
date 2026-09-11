// app/onboarding/stations.tsx — Screen 2: Station Search (v4)
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  FlatList,
  InteractionManager,
  Keyboard,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';
import Fuse from 'fuse.js';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useUserPreferencesStore } from '../../store/userPreferencesStore';
import { ensureDeviceIdentity } from '../../services/deviceIdentity';
import { resolveTflStopIdForStore } from '../../utils/resolveTflStopId';
import { TfLStation, FULL_STATIONS, cleanDisplayStationName, sanitiseStationName } from '../../data/tflStations';
import { tflCapitalise } from '../../utils/tflCapitalise';
import { OnboardingGradient } from '../../components/OnboardingGradient';
import { ProgressDots } from '../../components/ProgressDots';
import { StationCard } from '../../components/StationCard';
import { SkeletonCard } from '../../components/SkeletonCard';
import { playSound } from '../../utils/sound';
import { usePressAnimation } from '../../hooks/usePressAnimation';
import { BlurView } from 'expo-blur';
import { GLASS, PREMIUM_BUTTON } from '../../theme/colors';

// ─── Module-level constants ─────────────────────────────────────────────────
const MAJOR_INTERCHANGE_IDS = new Set([
  'victoria', 'kings-cross', 'oxford-circus', 'london-bridge',
  'green-park', 'london-waterloo', 'bank', 'paddington',
  'liverpool-street', 'stratford', 'canary-wharf', 'euston',
  'baker-street', 'farringdon', 'whitechapel',
]);

export default function StationsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ openSearch?: string }>();
  const openSearch = params.openSearch;

  const hasCompletedOnboarding = useUserPreferencesStore(s => s.hasCompletedOnboarding);

  const selectedLinesFromPrefs = useUserPreferencesStore(s => s.selectedLines);
  const selectedLinesFromOnboarding = useOnboardingStore(s => s.selectedLines);
  const selectedLines = hasCompletedOnboarding ? selectedLinesFromPrefs : selectedLinesFromOnboarding;

  const pinnedFromPrefs = useUserPreferencesStore(s => s.pinnedStations);
  const pinnedFromOnboarding = useOnboardingStore(s => s.pinnedStations);
  const pinnedStationsRaw = hasCompletedOnboarding ? pinnedFromPrefs : pinnedFromOnboarding;

  const pinnedStations = useMemo(() => {
    return pinnedStationsRaw.map(p => ({
      id: p.id,
      name: p.name,
      lines: 'lines' in p ? p.lines : (p as any).lineIds,
      zone: p.zone,
    }));
  }, [pinnedStationsRaw]);

  const recentSearchIds = useUserPreferencesStore(s => s.recentSearches);

  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [loading, setLoading] = useState(true);

  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (openSearch === 'true') {
      setIsSearching(true);
      setQuery('');
      InteractionManager.runAfterInteractions(() => {
        inputRef.current?.focus();
      });
    }
  }, [openSearch]);

  const canContinue = pinnedStations.length > 0;
  const backAnim = usePressAnimation('back_btn');
  const ctaBtnAnim = usePressAnimation('continue_btn', !canContinue);

  // ─── Luminous Focus Brightening (search bar glow on tap) ───────────────
  const searchFocusProgress = useSharedValue(0);
  useEffect(() => {
    searchFocusProgress.value = withTiming(isFocused ? 1 : 0, {
      duration: 200,
      easing: Easing.out(Easing.ease),
    });
  }, [isFocused, searchFocusProgress]);

  const luminousSearchStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      searchFocusProgress.value,
      [0, 1],
      ['rgba(255, 255, 255, 0.06)', 'rgba(255, 255, 255, 0.15)']
    ),
    borderColor: interpolateColor(
      searchFocusProgress.value,
      [0, 1],
      ['rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.45)']
    ),
    borderWidth: 1.25,
  }));

  const luminousIconColor = isFocused ? '#FFFFFF' : 'rgba(255, 255, 255, 0.35)';



  const ctaOpacity = useSharedValue(canContinue ? 1 : 0.35);

  useEffect(() => {
    ctaOpacity.value = withTiming(canContinue ? 1 : 0.35, {
      duration: 200,
      easing: Easing.inOut(Easing.ease),
    });
  }, [canContinue, ctaOpacity]);

  const ctaOpacityAnimatedStyle = useAnimatedStyle(() => ({
    opacity: ctaOpacity.value,
  }));

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


  const fuse = useMemo(
    () => new Fuse(cleanFullStations, {
      keys: ['name'],
      threshold: 0.2,
      minMatchCharLength: 4,
      distance: 60
    }),
    [cleanFullStations]
  );

  const results = useMemo<TfLStation[]>(() => {
    const trimmed = query.toLowerCase().trim();
    if (!trimmed) return [];

    // Substring match for responsiveness and exact substring queries
    const substringMatches = cleanFullStations.filter(s =>
      s.name.toLowerCase().includes(trimmed)
    );

    // Fuzzy matching for spelling tolerance
    const fuzzyMatches = fuse.search(trimmed).map(r => r.item);

    const combined = [...substringMatches];
    const seenIds = new Set(combined.map(s => s.id));
    for (const match of fuzzyMatches) {
      if (!seenIds.has(match.id)) {
        combined.push(match);
        seenIds.add(match.id);
      }
    }
    return combined;
  }, [query, fuse, cleanFullStations]);



  const isStationPinned = useCallback((station: TfLStation | { id: string; name: string }) => {
    const stationResolved = resolveTflStopIdForStore(station.id);
    const stationCleanName = sanitiseStationName(station.name);
    return pinnedStations.some(p => {
      return (
        p.id === station.id ||
        resolveTflStopIdForStore(p.id) === stationResolved ||
        sanitiseStationName(p.name) === stationCleanName
      );
    });
  }, [pinnedStations]);

  // ─── Line-Smart Recommendations (zero-typing station suggestions) ──────
  const lineRecommendedStations = useMemo(() => {
    if (!selectedLines || selectedLines.length === 0) return [];
    const lineSet = new Set(selectedLines.map((l: string) => l.toLowerCase()));
    const matching = cleanFullStations.filter(st =>
      st.lines.some(l => lineSet.has(l.toLowerCase())) &&
      !isStationPinned(st)
    );
    // Sort: major interchanges first, then alphabetical
    matching.sort((a, b) => {
      const aHub = MAJOR_INTERCHANGE_IDS.has(a.id) ? 0 : 1;
      const bHub = MAJOR_INTERCHANGE_IDS.has(b.id) ? 0 : 1;
      if (aHub !== bHub) return aHub - bHub;
      return a.name.localeCompare(b.name);
    });
    return matching.slice(0, 30); // Cap visual list at 30 for performance
  }, [selectedLines, cleanFullStations, isStationPinned]);

  const recentStations = useMemo(() => {
    const searchIds = recentSearchIds || [];
    return searchIds
      .map(id => cleanFullStations.find(s => s.id === id))
      .filter((s): s is TfLStation => !!s);
  }, [recentSearchIds, cleanFullStations]);

  const handleToggleStation = useCallback(
    async (station: TfLStation) => {
      // 1. Tactile feedback
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // 2. Drop keyboard and blur input cleanly
      inputRef.current?.blur();
      Keyboard.dismiss();

      // 3. Smooth layout transition for list collapse
      if (Platform.OS === 'ios' || (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental)) {
        try {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        } catch {
          // ignore layout anim fallback
        }
      }

      const isPinned = isStationPinned(station);
      if (isPinned) {
        playSound('deselect', 0.35);
        if (hasCompletedOnboarding) {
          useUserPreferencesStore.getState().unpinStation(station.id);
        } else {
          useOnboardingStore.getState().removeStation(station.id);
        }
      } else {
        playSound('select', 0.45);

        // Deduplicate and reinsert recent search at index 0 first
        useUserPreferencesStore.getState().addRecentSearch(station.id);

        if (hasCompletedOnboarding) {
          const role = useUserPreferencesStore.getState().pinnedStations.length === 0
            ? 'home'
            : useUserPreferencesStore.getState().pinnedStations.length === 1
              ? 'work'
              : 'other';
          useUserPreferencesStore.getState().pinStation({
            id: station.id,
            name: station.name,
            lines: station.lines,
            zone: station.zone,
          }, role);
        } else {
          useOnboardingStore.getState().addStation({
            id: station.id,
            name: station.name,
            lineIds: station.lines,
            zone: station.zone,
          });
        }

        // Auto-dismiss search sheet: clear query and exit search mode smoothly
        setQuery('');
        setIsSearching(false);
        setIsFocused(false);
      }
    },
    [isStationPinned, hasCompletedOnboarding]
  );

  const handleCancelSearch = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === 'ios' || (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental)) {
      try {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      } catch {
        // ignore layout anim fallback
      }
    }
    setQuery('');
    setIsSearching(false);
    setIsFocused(false);
    inputRef.current?.blur();
    Keyboard.dismiss();
  }, []);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playSound('pop', 0.32);
    if (query.trim() !== '' || isSearching || isFocused) {
      handleCancelSearch();
      return;
    }
    if (hasCompletedOnboarding) {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
    } else {
      useOnboardingStore.getState().setNavigationDirection('backward');
      useUserPreferencesStore.setState({ onboardingStep: 0 });
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/onboarding/lines');
      }
    }
  };

  // Onboarding is complete after 2 value screens — clear the onboarding
  // stack and land on the dashboard (mirrors the old tfl-registration exit).
  const finishOnboarding = useCallback(() => {
    useUserPreferencesStore.getState().completeOnboarding();
    // Bug #3 fix: create + persist device auth keys so the claims list can
    // actually load. Fire-and-forget — never blocks the 2-screen flow.
    ensureDeviceIdentity().catch(e =>
      console.warn('[onboarding] device identity creation failed:', e)
    );
    const parentNav = navigation.getParent();
    if (parentNav) {
      (parentNav as any).reset({
        index: 0,
        routes: [{ name: '(tabs)' }],
      });
    } else {
      router.replace('/(tabs)');
    }
  }, [navigation, router]);

  const handleCTAPress = async () => {
    if (pinnedStations.length === 0) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    playSound('confirm');

    if (hasCompletedOnboarding) {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
    } else {
      const mappedStations = pinnedStations.map((station, index) => ({
        id: station.id,
        name: station.name,
        lines: station.lines,
        zone: station.zone,
        role: index === 0 ? ('home' as const) : index === 1 ? ('work' as const) : ('other' as const),
      }));

      useUserPreferencesStore.setState({
        selectedLines,
        pinnedStations: mappedStations,
      });

      // Onboarding = 2 value screens (lines, stations). Straight to the
      // dashboard — no permission asks, no TfL registration. Permissions are
      // asked contextually post-activation (station pin, settings toggles,
      // Tier-1 upgrade); TfL registration resurfaces with Refund Radar.
      finishOnboarding();
    }
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Skip station selection → dashboard. Onboarding is 2 value screens —
    // no TfL registration, no permission asks up front.
    finishOnboarding();
  };

  const handleRecentPress = (station: TfLStation) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setQuery(station.name);
    setIsSearching(true);
  };

  const ctaLabel = pinnedStations.length === 0
    ? 'Add at least one station'
    : pinnedStations.length === 1
      ? 'Continue with 1 station'
      : `Continue with ${pinnedStations.length} stations`;

  const renderStationItem = useCallback(({ item }: { item: TfLStation }) => {
    const isPinned = isStationPinned(item);
    const isSearchingMode = query.trim() !== '';

    const rightElement = isSearchingMode ? (
      isPinned ? (
        <View style={styles.addedCircle}>
          <Ionicons
            name="checkmark"
            size={12}
            color="#0044EE"
          />
        </View>
      ) : (
        <View style={styles.addCircle}>
          <Ionicons
            name="add"
            size={14}
            color="#FFFFFF"
          />
        </View>
      )
    ) : (
      <View style={styles.removeCircle}>
        <Ionicons
          name="close"
          size={14}
          color="rgba(255, 255, 255, 0.70)"
        />
      </View>
    );

    return (
      <StationCard
        station={item}
        rightElement={rightElement}
        onPress={() => handleToggleStation(item)}
        selected={isPinned}
        mode="onboarding"
        showLedger={true}
      />
    );
  }, [isStationPinned, handleToggleStation, query]);

  // searchFocusedStyle replaced by luminousSearchStyle Reanimated value above

  const isShowRecents = query === '' && isFocused && recentStations.length > 0;

  return (
    <View style={styles.root}>
      <OnboardingGradient />

      <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />

      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.flex1}>
          {/* Navigation header fixed crown area */}
          <View style={[styles.navHeader, { paddingTop: insets.top + 4 }]}>
            <Pressable
              onPress={handleBack}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              style={({ pressed }) => [
                styles.backButtonPressable,
                pressed && styles.backButtonPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Go back"
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
            <View style={{ marginBottom: 6 }}>
              <ProgressDots total={2} current={2} />
            </View>
            <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
              Where do you catch your train?
            </Text>
          </View>

          {/* Search Row element */}
          <View style={styles.searchRow}>
            <Animated.View style={[styles.searchBarContainer, luminousSearchStyle]}>
              <Ionicons name="search-outline" size={16} color={luminousIconColor} style={styles.searchIconBase} />
              <TextInput
                ref={inputRef}
                value={query}
                onFocus={() => {
                  setIsFocused(true);
                  setIsSearching(true);
                }}
                onBlur={() => {
                  setIsFocused(false);
                  if (query.trim() === '') {
                    setIsSearching(false);
                  }
                }}
                onChangeText={(text) => {
                  setQuery(text);
                  setIsSearching(true);
                }}
                placeholder={`Search ${cleanFullStations.length} stations...`}
                placeholderTextColor="rgba(255, 255, 255, 0.30)"
                autoCorrect={false}
                autoCapitalize="none"
                style={styles.searchInput}
                returnKeyType="search"
                accessibilityLabel="Search stations"
              />
              {query.length > 0 && (
                <Pressable
                  onPress={() => {
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search text"
                >
                  <Ionicons name="close-circle" size={16} style={styles.clearIcon} />
                </Pressable>
              )}
            </Animated.View>

            {(isSearching || isFocused || query.length > 0) && (
              <Pressable
                onPress={handleCancelSearch}
                hitSlop={8}
                style={styles.searchCancelBtn}
                accessibilityRole="button"
                accessibilityLabel="Cancel search"
              >
                <Text style={styles.searchCancelText}>Cancel</Text>
              </Pressable>
            )}
          </View>

          {/* Main List Area */}
          <View style={styles.listArea}>
            {loading ? (
              <View style={styles.loadingListContainer}>
                {[1, 2, 3, 4, 5].map((idx) => (
                  <SkeletonCard key={idx} />
                ))}
              </View>
            ) : isShowRecents ? (
              /* Recent Searches Deck */
              <View style={styles.recentsContainer}>
                <View style={styles.recentsHeaderRow}>
                  <Text style={styles.recentsLabel}>Recent</Text>
                  <Pressable onPress={() => useUserPreferencesStore.getState().clearRecentSearches()} hitSlop={8}>
                    <Text style={styles.recentsClearBtn}>Clear</Text>
                  </Pressable>
                </View>
                <FlatList
                  data={recentStations}
                  keyExtractor={(item) => `recent-${item.id}`}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => handleRecentPress(item)}
                      style={styles.recentSearchCard}
                    >
                      <BlurView
                        intensity={45}
                        tint="dark"
                        style={[StyleSheet.absoluteFillObject, styles.recentCardBlur]}
                      />
                      <Text style={styles.recentSearchText} numberOfLines={1}>
                        {tflCapitalise(cleanDisplayStationName(item.name))}
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.25)" />
                    </Pressable>
                  )}
                  contentContainerStyle={styles.recentListContent}
                  showsVerticalScrollIndicator={false}
                  keyboardDismissMode="on-drag"
                  keyboardShouldPersistTaps="handled"
                />
              </View>
            ) : isSearching && query.trim() === '' && lineRecommendedStations.length > 0 ? (
              /* Line-Smart Recommendations (zero-typing) */
              <View style={styles.lineRecsContainer}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionHeaderText}>STATIONS ON YOUR LINES</Text>
                </View>
                <FlatList
                  data={lineRecommendedStations}
                  renderItem={renderStationItem}
                  keyExtractor={(item) => `rec-${item.id}`}
                  initialNumToRender={12}
                  windowSize={5}
                  contentContainerStyle={styles.lineRecsListContent}
                  showsVerticalScrollIndicator={false}
                  keyboardDismissMode="on-drag"
                  keyboardShouldPersistTaps="handled"
                />
              </View>
            ) : (
              /* Pinned / Search Results Main Timetable */
              <FlatList
                data={query.trim() !== '' ? results : pinnedStations}
                renderItem={renderStationItem}
                keyExtractor={(item) => item.id}
                initialNumToRender={12}
                windowSize={5}
                contentContainerStyle={styles.listContainer}
                showsVerticalScrollIndicator={false}
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
                ListHeaderComponent={
                  !isSearching && query.trim() === '' && pinnedStations.length > 0 ? (
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionHeaderText}>
                        YOUR PINNED STATIONS ({pinnedStations.length})
                      </Text>
                    </View>
                  ) : null
                }
                ListFooterComponent={
                  !isSearching && query.trim() === '' && pinnedStations.length > 0 ? (
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        if (Platform.OS === 'ios' || (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental)) {
                          try {
                            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                          } catch {}
                        }
                        setIsSearching(true);
                        setIsFocused(true);
                        InteractionManager.runAfterInteractions(() => {
                          inputRef.current?.focus();
                        });
                      }}
                      style={({ pressed }) => [
                        styles.addAnotherCard,
                        pressed && styles.addAnotherCardPressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={pinnedStations.length === 1 ? 'Add destination station' : 'Add another station'}
                    >
                      <BlurView intensity={GLASS.blurIntensity} tint="dark" style={StyleSheet.absoluteFillObject} />
                      <View style={styles.addAnotherIconCircle}>
                        <Ionicons name="add" size={16} color="#FFFFFF" />
                      </View>
                      <View style={styles.addAnotherTextContainer}>
                        <Text style={styles.addAnotherTitle}>
                          {pinnedStations.length === 1 ? 'Add destination (e.g. Work)' : 'Add another station'}
                        </Text>
                        <Text style={styles.addAnotherSubtitle}>
                          {pinnedStations.length === 1 ? 'Pair with home station for automatic delay repay' : 'Pro Unlimited · Full corridor & disruption surveillance'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.25)" />
                    </Pressable>
                  ) : null
                }
                ListEmptyComponent={() => {
                  if (query.trim() !== '') {
                    return (
                      <View style={styles.emptyState}>
                        <Ionicons name="search-outline" size={32} color="rgba(255,255,255,0.20)" />
                        <Text style={styles.emptyText}>No stations found</Text>
                        <Text style={styles.emptySubText}>Try a different name</Text>
                      </View>
                    );
                  }
                  return (
                    <View style={styles.emptyState}>
                      <Ionicons name="train-outline" size={36} color="rgba(255,255,255,0.20)" />
                      <Text style={styles.emptyText}>Search for stations above</Text>
                      <Text style={styles.emptySubText}>Add your home or work station to track delays</Text>
                    </View>
                  );
                }}
              />
            )}
          </View>
        </View>

        {/* Sticky CTA Footer */}
        {!isSearching && (
          <View
            style={[styles.ctaStickyFooter, { paddingBottom: Math.max(insets.bottom, 16) }]}
          >
            <Pressable
              onPress={handleCTAPress}
              onPressIn={ctaBtnAnim.onPressIn}
              onPressOut={ctaBtnAnim.onPressOut}
              disabled={!canContinue}
              style={styles.ctaPressable}
            >
              <Animated.View
                style={[
                  styles.ctaButton,
                  ctaBtnAnim.animatedStyle,
                  ctaOpacityAnimatedStyle,
                ]}
              >
                <Text style={styles.ctaButtonText}>
                  {ctaLabel}
                </Text>
              </Animated.View>
            </Pressable>

            {!hasCompletedOnboarding && (
              <Pressable onPress={handleSkip} style={styles.skipPressable}>
                <Text style={styles.skipText}>Skip for now</Text>
              </Pressable>
            )}
          </View>
        )}
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
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.70)',
    marginLeft: 4,
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 2,
  },
  eyebrow: {
    fontSize: 9,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: 'rgba(255,255,255,0.30)',
    letterSpacing: 1.8,
  },
  title: {
    fontSize: 22,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#FFFFFF',
    letterSpacing: -0.8,
    marginTop: 2,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: -1,
    marginBottom: 6,
  },
  searchBarContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  searchCancelBtn: {
    paddingLeft: 12,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  searchCancelText: {
    fontSize: 14,
    fontFamily: 'SpaceGrotesk_600SemiBold',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  searchIconBase: {
    marginRight: 8,
  },
  clearIcon: {
    marginLeft: 8,
    color: 'rgba(255, 255, 255, 0.35)',
  },
  searchInput: {
    flex: 1,
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 14,
    height: '100%',
    color: '#FFFFFF',
  },
  listArea: {
    flex: 1,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 130,
  },
  loadingListContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 9,
  },
  skeletonCard: {
    height: 68,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    marginTop: 8,
  },
  emptySubText: {
    fontSize: 12,
    fontFamily: 'SpaceGrotesk_500Medium',
    color: 'rgba(255,255,255,0.22)',
    textAlign: 'center',
    marginTop: 4,
  },
  addedCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: PREMIUM_BUTTON.background,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: GLASS.shadowColor,
    shadowOffset: GLASS.shadowOffset,
    shadowOpacity: PREMIUM_BUTTON.shadowOpacity,
    shadowRadius: PREMIUM_BUTTON.shadowRadius,
  },
  addCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: PREMIUM_BUTTON.borderWidth,
    borderColor: PREMIUM_BUTTON.borderColor,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PREMIUM_BUTTON.background,
    shadowOpacity: PREMIUM_BUTTON.shadowOpacity,
    shadowRadius: PREMIUM_BUTTON.shadowRadius,
  },
  removeCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    paddingBottom: 8,
    paddingTop: 4,
  },
  sectionHeaderText: {
    fontSize: 10,
    fontFamily: 'SpaceGrotesk_700Bold',
    letterSpacing: 1.2,
    color: 'rgba(255, 255, 255, 0.45)',
  },
  addAnotherCard: {
    height: 60,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 14,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1.25,
    borderColor: 'rgba(0, 102, 204, 0.40)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(0, 102, 204, 0.06)',
  },
  addAnotherCardPressed: {
    backgroundColor: 'rgba(0, 102, 204, 0.14)',
  },
  addAnotherIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 102, 204, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(0, 102, 204, 0.60)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  addAnotherTextContainer: {
    flex: 1,
  },
  addAnotherTitle: {
    fontSize: 14,
    fontFamily: 'SpaceGrotesk_600SemiBold',
    color: '#FFFFFF',
  },
  addAnotherSubtitle: {
    fontSize: 11,
    fontFamily: 'SpaceGrotesk_500Medium',
    color: 'rgba(255, 255, 255, 0.45)',
    marginTop: 1,
  },
  recentsContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  recentsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  recentsLabel: {
    fontSize: 10,
    fontFamily: 'SpaceGrotesk_700Bold',
    letterSpacing: 0.8,
    color: 'rgba(255,255,255,0.58)',
  },
  recentsClearBtn: {
    fontSize: 11,
    fontFamily: 'SpaceGrotesk_500Medium',
    color: 'rgba(255,255,255,0.35)',
  },
  recentListContent: {
    gap: 9,
    paddingBottom: 60,
  },
  recentSearchCard: {
    height: 52,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1.25,
    borderColor: GLASS.borderColor,
  },
  recentCardBlur: {
    backgroundColor: GLASS.background,
  },
  recentSearchText: {
    fontSize: 15,
    fontFamily: 'SpaceGrotesk_600SemiBold',
    color: 'rgba(255, 255, 255, 0.90)',
    flex: 1,
  },
  ctaStickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 14,
    overflow: 'hidden',
  },
  lineRecsContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  lineRecsListContent: {
    paddingBottom: 130,
  },
  ctaPressable: {
    width: '100%',
  },
  ctaButton: {
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButtonText: {
    fontSize: 15,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#07103a',
  },
  skipPressable: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 18,
    backgroundColor: PREMIUM_BUTTON.background,
    borderWidth: PREMIUM_BUTTON.borderWidth,
    borderColor: PREMIUM_BUTTON.borderColor,
    shadowOpacity: PREMIUM_BUTTON.shadowOpacity,
    shadowRadius: PREMIUM_BUTTON.shadowRadius,
    alignSelf: 'center',
  },
  skipText: {
    fontSize: 12,
    fontFamily: 'SpaceGrotesk_500Medium',
    color: 'rgba(255, 255, 255, 0.35)',
  },
  backButtonPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: PREMIUM_BUTTON.background,
    borderWidth: PREMIUM_BUTTON.borderWidth,
    borderColor: PREMIUM_BUTTON.borderColor,
    shadowOpacity: PREMIUM_BUTTON.shadowOpacity,
    shadowRadius: PREMIUM_BUTTON.shadowRadius,
  },
  backButtonPressed: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
});
