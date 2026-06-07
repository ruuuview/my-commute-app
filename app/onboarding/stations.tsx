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
  Image,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withRepeat,
  cancelAnimation,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import Fuse from 'fuse.js';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useUserPreferencesStore } from '../../store/userPreferencesStore';
import { TfLStation, FULL_STATIONS, cleanDisplayStationName } from '../../data/tflStations';
import { tflCapitalise } from '../../utils/tflCapitalise';
import { OnboardingGradient } from '../../components/OnboardingGradient';
import { ProgressDots } from '../../components/ProgressDots';
import { StationCard } from '../../components/StationCard';
import { playSound } from '../../utils/sound';
import { usePressAnimation } from '../../hooks/usePressAnimation';
import { LINE_COLORS } from '../../constants/lineColors';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

const MAX_PINS = 5;

function SkeletonCard() {
  const opacity = useSharedValue(0.4);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;
    opacity.value = withRepeat(
      withTiming(1.0, { duration: 600, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    return () => cancelAnimation(opacity);
  }, [opacity, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.skeletonCard, animatedStyle]} />
  );
}

export default function StationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ openSearch?: string }>();
  const openSearch = params.openSearch;

  const hasCompletedOnboarding = useUserPreferencesStore(s => s.hasCompletedOnboarding);

  const selectedLines = useMemo(() => {
    return hasCompletedOnboarding 
      ? useUserPreferencesStore.getState().selectedLines 
      : useOnboardingStore.getState().selectedLines;
  }, [hasCompletedOnboarding]);

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
  const [maxPinsToast, setMaxPinsToast] = useState(false);
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

  const maxPinsShakeX = useSharedValue(0);
  const maxPinsShakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: maxPinsShakeX.value }],
  }));

  const triggerMaxPinsShake = useCallback(() => {
    maxPinsShakeX.value = withSequence(
      withTiming(-8, { duration: 60, easing: Easing.linear }),
      withTiming(8, { duration: 60, easing: Easing.linear }),
      withTiming(-6, { duration: 60, easing: Easing.linear }),
      withTiming(6, { duration: 60, easing: Easing.linear }),
      withTiming(0, { duration: 60, easing: Easing.linear })
    );
  }, [maxPinsShakeX]);

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

  const popularStations = useMemo(() => {
    const POPULAR_NAMES = ['bank', 'canary wharf', "king's cross st. pancras", 'waterloo', 'liverpool street'];
    const filtered = cleanFullStations.filter(st => {
      const stName = st.name.toLowerCase();
      return POPULAR_NAMES.some(pName => stName.includes(pName));
    });
    return filtered.filter(st => st.lines.some(l => selectedLines.includes(l)));
  }, [selectedLines, cleanFullStations]);

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
    if (!query.trim()) return popularStations;
    return fuse.search(query.toLowerCase().trim()).map(r => r.item);
  }, [query, popularStations, fuse]);

  useEffect(() => {
    if (query.trim() && results.length === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      playSound('error');
    }
  }, [results.length, query]);

  const pinnedIds = useMemo(() => new Set(pinnedStations.map(p => p.id)), [pinnedStations]);

  const recentStations = useMemo(() => {
    const searchIds = recentSearchIds || [];
    return searchIds
      .map(id => cleanFullStations.find(s => s.id === id))
      .filter((s): s is TfLStation => !!s);
  }, [recentSearchIds, cleanFullStations]);

  const handleToggleStation = useCallback(
    async (station: TfLStation) => {
      const isPinned = pinnedIds.has(station.id);
      if (isPinned) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        playSound('deselect', 0.35);
        if (hasCompletedOnboarding) {
          useUserPreferencesStore.getState().unpinStation(station.id);
        } else {
          useOnboardingStore.getState().removeStation(station.id);
        }
      } else {
        if (pinnedStations.length >= MAX_PINS) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          triggerMaxPinsShake();
          setMaxPinsToast(true);
          setTimeout(() => setMaxPinsToast(false), 1500);
          return;
        }
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        playSound('select', 0.45);

        // Deduplicate and reinsert recent search at index 0 first
        useUserPreferencesStore.getState().addRecentSearch(station.id);
        
        // Immediate clean dismiss
        setQuery('');
        setIsSearching(false);

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
      }
    },
    [pinnedIds, pinnedStations, hasCompletedOnboarding, triggerMaxPinsShake]
  );

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playSound('pop', 0.32);
    if (hasCompletedOnboarding) {
      router.back();
    } else {
      useOnboardingStore.getState().setNavigationDirection('backward');
      router.back();
    }
  };

  const handleCTAPress = async () => {
    if (pinnedStations.length === 0) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    playSound('confirm');

    if (hasCompletedOnboarding) {
      router.back();
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
        hasCompletedOnboarding: true,
        onboardingStep: 3,
      });

      requestAnimationFrame(() => {
        router.replace('/');
      });
    }
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    useUserPreferencesStore.getState().completeOnboarding();
    requestAnimationFrame(() => {
      router.replace('/');
    });
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
    const isPinned = pinnedIds.has(item.id);
    const primaryLine = item.lines[0] || 'central';
    const primaryLineColor = LINE_COLORS[primaryLine] || '#888';

    const rightElement = (
      <View style={isPinned ? styles.addedCircle : styles.addCircle}>
        <Ionicons
          name={isPinned ? 'checkmark' : 'add'}
          size={12}
          color={isPinned ? '#0044EE' : '#FFFFFF'}
        />
      </View>
    );

    return (
      <StationCard
        station={item}
        primaryLineColor={primaryLineColor}
        rightElement={rightElement}
        onPress={() => handleToggleStation(item)}
        selected={isPinned}
        mode="onboarding"
        showLedger={true}
      />
    );
  }, [pinnedIds, handleToggleStation]);

  const searchFocusedStyle = isFocused ? { borderColor: 'rgba(255,255,255,0.40)' } : { borderColor: 'rgba(255,255,255,0.14)' };

  const isShowRecents = query === '' && isSearching && recentStations.length > 0;

  return (
    <View style={styles.root}>
      <OnboardingGradient />

      {/* Volumetric Bloom Layers */}
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

      {/* Grain Overlay */}
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        <Image
          source={require('../../assets/images/grain.png')}
          style={[StyleSheet.absoluteFillObject, { opacity: 0.03 }]}
          resizeMode="repeat"
        />
      </View>

      <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />

      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.flex1}>
          {/* Navigation header fixed crown area */}
          <View style={[styles.navHeader, { paddingTop: insets.top + 8 }]}>
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
            <View style={styles.headerTopRow}>
              <Text style={styles.eyebrow}>SETUP · STEP 2 OF 2</Text>
              <ProgressDots total={2} current={2} />
            </View>
            <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
              Your stations
            </Text>
          </View>

          {/* Search Bar element */}
          <View style={[styles.searchBarContainer, searchFocusedStyle]}>
            <Ionicons name="search-outline" size={16} style={styles.searchIcon} />
            <TextInput
              ref={inputRef}
              value={query}
              onFocus={() => {
                setIsFocused(true);
                setIsSearching(true);
              }}
              onBlur={() => {
                setIsFocused(false);
                if (query === '') {
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
              <Pressable onPress={() => { setQuery(''); }} hitSlop={8}>
                <Ionicons name="close-circle" size={16} style={styles.clearIcon} />
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
                        intensity={20}
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
            ) : (
              /* Pinned / Search Results Main Timetable */
              <FlatList
                data={isSearching ? results : pinnedStations}
                renderItem={renderStationItem}
                keyExtractor={(item) => item.id}
                initialNumToRender={12}
                windowSize={5}
                removeClippedSubviews={true}
                contentContainerStyle={[
                  styles.listContainer,
                ]}
                showsVerticalScrollIndicator={false}
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={() => {
                  if (isSearching) {
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
                      <Text style={styles.emptyText}>Search for stations above</Text>
                    </View>
                  );
                }}
              />
            )}
          </View>
        </View>

        {/* Sticky CTA Footer */}
        {!isSearching && (
          <BlurView
            intensity={28}
            tint="dark"
            style={[styles.ctaStickyFooter, { paddingBottom: Math.max(insets.bottom, 16) }]}
          >
            {maxPinsToast && (
              <Animated.View style={[styles.maxPinsToast, maxPinsShakeStyle]}>
                <Text style={styles.maxPinsToastText}>Maximum {MAX_PINS} stations</Text>
              </Animated.View>
            )}

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
          </BlurView>
        )}
      </KeyboardAvoidingView>

      {/* Bottom Fade Overlay for scroll affordance */}
      <LinearGradient
        colors={['rgba(4, 8, 16, 0)', 'rgba(4, 8, 16, 0.85)']}
        style={styles.bottomFade}
        pointerEvents="none"
      />
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
    paddingBottom: 6,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    marginTop: 4,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },
  searchIcon: {
    marginRight: 8,
    color: 'rgba(255, 255, 255, 0.35)',
  },
  clearIcon: {
    marginLeft: 8,
    color: 'rgba(255, 255, 255, 0.35)',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    height: '100%',
    color: '#FFFFFF',
  },
  listArea: {
    flex: 1,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
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
    fontWeight: '600',
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    marginTop: 8,
  },
  emptySubText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.22)',
    textAlign: 'center',
    marginTop: 4,
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
  },
  addedCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(0,0,0,0.12)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 3,
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
    fontWeight: '600',
    letterSpacing: 0.8,
    color: 'rgba(255,255,255,0.28)',
    textTransform: 'uppercase',
  },
  recentsClearBtn: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.35)',
  },
  recentListContent: {
    gap: 9,
    paddingBottom: 60,
  },
  recentSearchCard: {
    height: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.13)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  recentCardBlur: {
    backgroundColor: Platform.OS === 'android' ? 'rgba(15, 20, 70, 0.85)' : 'rgba(255, 255, 255, 0.07)',
  },
  recentSearchText: {
    fontSize: 15,
    fontWeight: '600',
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
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  maxPinsToast: {
    backgroundColor: 'rgba(220, 38, 38, 0.12)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  maxPinsToastText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
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
    fontFamily: 'System',
    fontWeight: '700',
    color: '#07103a',
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
  bottomFade: {
    position: 'absolute',
    bottom: 110,
    left: 0,
    right: 0,
    height: 80,
  },
});
