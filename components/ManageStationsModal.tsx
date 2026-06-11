import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  Keyboard,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { TfLStation, FULL_STATIONS, cleanDisplayStationName } from '../data/tflStations';
import { tflCapitalise } from '../utils/tflCapitalise';
import { StationCard } from './StationCard';
import { playSound } from '../utils/sound';
import { SCREEN_PADDING } from '../constants/layout';
import Fuse from 'fuse.js';

const MAX_PINS = 5;

interface ManageStationsModalProps {
  visible: boolean;
  onClose: () => void;
}

export function ManageStationsModal({ visible, onClose }: ManageStationsModalProps) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  const pinnedStations = useUserPreferencesStore(s => s.pinnedStations);
  const pinStation = useUserPreferencesStore(s => s.pinStation);
  const unpinStation = useUserPreferencesStore(s => s.unpinStation);
  const recentSearchIds = useUserPreferencesStore(s => s.recentSearches);
  const addRecentSearch = useUserPreferencesStore(s => s.addRecentSearch);
  const clearRecentSearches = useUserPreferencesStore(s => s.clearRecentSearches);

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [maxPinsToast, setMaxPinsToast] = useState(false);

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

  // Clean full stations mapping for search logic (deduplication)
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

  // Set up Fuse.js matching
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
    if (!query.trim()) return [];
    return fuse.search(query.toLowerCase().trim()).map(r => r.item);
  }, [query, fuse]);

  const showResults = isSearching && query.trim() !== '';

  useEffect(() => {
    if (query.trim().length >= 4 && results.length === 0) {
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
        unpinStation(station.id);
      } else {
        if (pinnedStations.length >= MAX_PINS) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          triggerMaxPinsShake();
          setMaxPinsToast(true);
          setTimeout(() => setMaxPinsToast(false), 1500);
          return;
        }
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        playSound('select', 0.45);

        addRecentSearch(station.id);
        
        // Immediate clean dismiss
        Keyboard.dismiss();
        setQuery('');
        setIsSearching(false);

        const role = pinnedStations.length === 0
          ? 'home'
          : pinnedStations.length === 1
          ? 'work'
          : 'other';

        pinStation({
          id: station.id,
          name: station.name,
          lines: station.lines,
          zone: station.zone,
        }, role);
      }
    },
    [pinnedIds, pinnedStations, addRecentSearch, pinStation, unpinStation, triggerMaxPinsShake]
  );

  const handleRecentPress = (station: TfLStation) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setQuery(station.name);
    setIsSearching(true);
  };

  const renderStationItem = useCallback(({ item }: { item: TfLStation }) => {
    const isPinned = pinnedIds.has(item.id);

    const rightElement = isPinned ? (
      <View style={styles.addedCircle}>
        <Ionicons
          name="checkmark"
          size={12}
          color="#0044EE"
        />
      </View>
    ) : null;

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
  }, [pinnedIds, handleToggleStation]);

  const searchFocusedStyle = isFocused
    ? { borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.35)', backgroundColor: 'rgba(255, 255, 255, 0.09)' }
    : { borderWidth: 0, borderColor: 'transparent', backgroundColor: 'rgba(255, 255, 255, 0.06)' };

  const isShowRecents = query === '' && isSearching && recentStations.length > 0;

  // Clean modal onClose to reset search state
  const handleClose = () => {
    setQuery('');
    setIsSearching(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      presentationStyle="overFullScreen"
      animationType="slide"
      onRequestClose={handleClose}
    >
      <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill}>
        {/* Drag handle */}
        <View style={[styles.dragHandleWrap, { paddingTop: insets.top + 8 }]}>
          <View style={styles.dragHandle} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.container}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
              Manage stations
              {pinnedStations.length > 0 && (
                <Text style={styles.counterInline}> · {pinnedStations.length} of {MAX_PINS}</Text>
              )}
            </Text>
            <Pressable
              onPress={handleClose}
              style={({ pressed }) => [styles.donePill, pressed && { opacity: 0.65 }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Done, close manage stations"
            >
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </View>

          {/* Max pins toast */}
          {maxPinsToast && (
            <Animated.View style={[styles.maxPinsToast, maxPinsShakeStyle]}>
              <Text style={styles.maxPinsToastText}>Maximum {MAX_PINS} stations</Text>
            </Animated.View>
          )}

          {/* Search Bar */}
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
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} style={styles.clearIcon} />
              </Pressable>
            )}
          </View>

          {/* Main List Area */}
          <View style={styles.listArea}>
            {isShowRecents ? (
              /* Recent Searches */
              <View style={styles.recentsContainer}>
                <View style={styles.recentsHeaderRow}>
                  <Text style={styles.recentsLabel}>Recent</Text>
                  <Pressable onPress={clearRecentSearches} hitSlop={8}>
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
            ) : (
              /* Pinned Stations (when not searching) or Search Results */
              <FlatList
                data={showResults ? results : pinnedStations.map(p => ({
                  id: p.id,
                  name: p.name,
                  lines: p.lines,
                  zone: p.zone,
                }))}
                renderItem={renderStationItem}
                keyExtractor={(item) => item.id}
                initialNumToRender={12}
                windowSize={5}
                contentContainerStyle={[
                  styles.listContainer,
                  { paddingBottom: insets.bottom + 24 }
                ]}
                showsVerticalScrollIndicator={false}
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={() => {
                  if (showResults) {
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
                      <Text style={styles.emptyText}>Search for stations above to pin them</Text>
                    </View>
                  );
                }}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  dragHandleWrap: {
    alignItems: 'center',
    paddingBottom: 12,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SCREEN_PADDING,
    paddingBottom: 12,
  },
  title: {
    fontSize: 22,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#FFFFFF',
    letterSpacing: -0.8,
  },
  counterInline: {
    fontSize: 22,
    fontFamily: 'SpaceGrotesk_500Medium',
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: -0.8,
  },
  donePill: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.30)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  doneText: {
    fontSize: 14,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#FFFFFF',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SCREEN_PADDING,
    marginTop: -1,
    marginBottom: 6,
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 14,
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
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 14,
    height: '100%',
    color: '#FFFFFF',
  },
  listArea: {
    flex: 1,
  },
  listContainer: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 8,
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
    width: 24,
    height: 24,
    borderRadius: 12,
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
    paddingHorizontal: SCREEN_PADDING,
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
    color: 'rgba(255,255,255,0.28)',
    textTransform: 'uppercase',
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
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  recentCardBlur: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  recentSearchText: {
    fontSize: 15,
    fontFamily: 'SpaceGrotesk_600SemiBold',
    color: 'rgba(255, 255, 255, 0.90)',
    flex: 1,
  },
  maxPinsToast: {
    backgroundColor: 'rgba(220, 38, 38, 0.12)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 10,
    marginHorizontal: SCREEN_PADDING,
    alignSelf: 'flex-start',
  },
  maxPinsToastText: {
    fontSize: 11,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#DC2626',
  },
});
