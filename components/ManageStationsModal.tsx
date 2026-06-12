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
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { TfLStation, FULL_STATIONS, cleanDisplayStationName } from '../data/tflStations';
import { tflCapitalise } from '../utils/tflCapitalise';
import { usePressAnimation } from '../hooks/usePressAnimation';
import { LINE_COLORS } from '../constants/lineColors';
import { LINE_SHORT_NAMES } from '../data/lineMetadata';
import { getPillColors } from '../utils/pillColors';
import { playSound } from '../utils/sound';
import { SCREEN_PADDING } from '../constants/layout';
import Fuse from 'fuse.js';

const MAX_PINS = 5;
const SHEET_HEIGHT_RATIO = 0.78;

interface ManageStationsModalProps {
  visible: boolean;
  onClose: () => void;
}

interface CompactStationCardProps {
  station: TfLStation;
  selected: boolean;
  onPress: () => void;
}

function CompactStationCard({ station, selected, onPress }: CompactStationCardProps) {
  const reducedMotion = useReducedMotion();
  const pressAnim = usePressAnimation('station_row', false);
  const cleanName = tflCapitalise(cleanDisplayStationName(station.name));

  const visibleLines = station.lines.slice(0, 4);
  const overflowCount = station.lines.length - 4;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressAnim.onPressIn}
      onPressOut={pressAnim.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={`${cleanName}, ${selected ? 'selected' : 'unselected'}`}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.compactCard,
        pressed && { opacity: 0.65 },
      ]}
    >
      <Animated.View style={[styles.compactCardInner, !reducedMotion && pressAnim.animatedStyle]}>
        <BlurView
          intensity={80}
          tint="dark"
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.compactCardContent}>
          <View style={styles.compactMainRow}>
            <Text style={styles.compactStationName} numberOfLines={1} ellipsizeMode="tail">
              {cleanName}
            </Text>
            
            {/* Fix 4: Add Button / Checkmark on the far right */}
            <View style={styles.compactAddBtnContainer}>
              {selected ? (
                <View style={styles.compactCheckmarkBadge}>
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                </View>
              ) : (
                <View style={styles.compactAddBtn}>
                  <Ionicons name="add" size={14} color="#FFFFFF" />
                </View>
              )}
            </View>
          </View>

          <View style={styles.compactPillsContainer}>
            {visibleLines.map((lineId) => {
              const shortName = LINE_SHORT_NAMES[lineId] || lineId;
              const brandColor = LINE_COLORS[lineId] || '#888';
              const colors = getPillColors(lineId, brandColor);

              return (
                <View
                  key={lineId}
                  style={[styles.compactPillItem, { borderColor: colors.borderColor }]}
                >
                  <View style={[styles.compactPillColorLayer, { backgroundColor: colors.backgroundColor }]} />
                  <View style={[styles.compactPillDot, { backgroundColor: colors.dotColor }]} />
                  <Text style={[styles.compactPillText, { color: colors.textColor }]}>{shortName}</Text>
                </View>
              );
            })}
            {overflowCount > 0 && (
              <View style={styles.compactOverflowBadge}>
                <Text style={styles.compactOverflowText}>+{overflowCount}</Text>
              </View>
            )}
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export function ManageStationsModal({ visible, onClose }: ManageStationsModalProps) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const inputRef = useRef<TextInput>(null);

  const pinnedStations = useUserPreferencesStore(s => s.pinnedStations);
  const pinStation = useUserPreferencesStore(s => s.pinStation);

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  const [query, setQuery] = useState('');
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

  const pinnedIds = useMemo(() => new Set(pinnedStations.map(p => p.id)), [pinnedStations]);

  const unpinnedResults = useMemo(() => {
    return results.filter(s => !pinnedIds.has(s.id));
  }, [results, pinnedIds]);

  useEffect(() => {
    if (query.trim().length >= 4 && unpinnedResults.length === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      playSound('error');
    }
  }, [unpinnedResults.length, query]);



  const handleToggleStation = useCallback(
    async (station: TfLStation) => {
      if (pinnedStations.length >= MAX_PINS) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        triggerMaxPinsShake();
        setMaxPinsToast(true);
        setTimeout(() => setMaxPinsToast(false), 1500);
        return;
      }
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      playSound('select', 0.45);

      // Immediate clean dismiss
      Keyboard.dismiss();
      setQuery('');

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
    },
    [pinnedStations, pinStation, triggerMaxPinsShake]
  );

  const renderStationItem = useCallback(({ item }: { item: TfLStation }) => {
    return (
      <CompactStationCard
        station={item}
        selected={pinnedIds.has(item.id)}
        onPress={() => handleToggleStation(item)}
      />
    );
  }, [handleToggleStation, pinnedIds]);

  const searchFocusedStyle = isFocused
    ? { borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.35)', backgroundColor: 'rgba(255, 255, 255, 0.09)' }
    : { borderWidth: 0, borderColor: 'transparent', backgroundColor: 'rgba(255, 255, 255, 0.06)' };

  // Clean modal onClose to reset search state
  const handleClose = () => {
    setQuery('');
    onClose();
  };

  const sheetHeight = screenHeight * SHEET_HEIGHT_RATIO;

  return (
    <Modal
      visible={visible}
      transparent={true}
      presentationStyle="overFullScreen"
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.root}>
        {/* Transparent dismissible backdrop — covers the area above the sheet */}
        <Pressable
          style={styles.backdrop}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss manage stations"
        />

        {/* Bottom sheet — 78% of screen height */}
        <View style={[styles.sheet, { height: sheetHeight }]}>
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />

          {/* Drag handle */}
          <View style={styles.dragHandleWrap}>
            <View style={styles.dragHandle} />
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.container}
            keyboardVerticalOffset={0}
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
                }}
                onBlur={() => {
                  setIsFocused(false);
                }}
                onChangeText={(text) => {
                  setQuery(text);
                }}
                selectionColor="rgba(255,255,255,0.6)"
                placeholder="Search 358 stations..."
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
              <FlatList
                data={query.trim() === '' ? [] : unpinnedResults}
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
                      <Text style={styles.emptyText}>No popular stations available</Text>
                    </View>
                  );
                }}
              />
            </View>
          </KeyboardAvoidingView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  container: {
    flex: 1,
  },
  dragHandleWrap: {
    alignItems: 'center',
    paddingTop: 10,
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.30)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  doneText: {
    fontSize: 14,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: 'rgba(255, 255, 255, 0.80)',
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
  compactCard: {
    alignSelf: 'stretch',
    borderRadius: 14,
    marginBottom: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    minHeight: 62,
  },
  compactCardInner: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  compactCardContent: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
  },
  compactMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  compactStationName: {
    fontSize: 14,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: 'rgba(255, 255, 255, 0.95)',
    flex: 1,
    marginRight: 12,
  },
  compactPillsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactPillItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
    position: 'relative',
  },
  compactPillColorLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  compactPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  compactPillText: {
    fontSize: 9,
    fontWeight: '600',
    fontFamily: 'SpaceGrotesk_600SemiBold',
  },
  compactOverflowBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderRadius: 4,
    paddingHorizontal: 4,
    height: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactOverflowText: {
    fontSize: 8,
    color: 'rgba(255, 255, 255, 0.45)',
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  compactAddBtnContainer: {
    marginLeft: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactAddBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.30)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  compactCheckmarkBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.30)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
});
