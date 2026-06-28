import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
  Platform,
  AccessibilityInfo,
  findNodeHandle,
  ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
  runOnJS,
  FadeInUp,
  LinearTransition,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { useStationDataStore, StationLineData, ArrivalRow } from '../store/stationDataStore';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { resolveTflStopIds } from '../utils/resolveTflStopId';
import { cleanDisplayStationName } from '../data/tflStations';
import { tflCapitalise } from '../utils/tflCapitalise';
import { processStationArrivals } from '../utils/groupStationDepartures';
import { usePressAnimation } from '../hooks/usePressAnimation';
import { APP_CONFIG } from '../config/app.config';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const POPUP_WIDTH = Math.min(SCREEN_WIDTH - 32, 390);

// ─── Anchor rect type ──────────────────────────────────────────────
interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Pressable Arrival Row with haptics, spring bounce, and line color pip ───

function ArrivalRowItem({
  arrival,
  lineColor,
  isFirstDue,
}: {
  arrival: ArrivalRow;
  lineColor: string;
  isFirstDue: boolean;
}) {
  const pressAnim = usePressAnimation('station_row', false);
  const isDue = arrival.minutesAway === 0;

  const finalDest = useMemo(() => {
    return arrival.destination
      .replace(/(Northbound|Southbound|Eastbound|Westbound)\s*-?\s*/gi, '')
      .trim();
  }, [arrival.destination]);

  const platformText = useMemo(() => {
    if (!arrival.platform) return '';
    const stripped = arrival.platform
      .replace(/(Northbound|Southbound|Eastbound|Westbound)\s*-?\s*/gi, '')
      .replace(/Platform\s+/i, 'P')
      .trim();
    const match = stripped.match(/P\d+[a-zA-Z]?/i);
    return match ? match[0].toUpperCase() : '';
  }, [arrival.platform]);

  const timeColor = useMemo(() => {
    if (isDue) {
      return isFirstDue ? '#30D158' : 'rgba(255, 255, 255, 0.85)';
    }
    if (arrival.minutesAway <= 2) {
      return 'rgba(255, 255, 255, 0.85)';
    }
    return 'rgba(255, 255, 255, 0.55)';
  }, [isDue, isFirstDue, arrival.minutesAway]);

  const fontWeight = isDue && isFirstDue ? '700' : '500';

  return (
    <Animated.View style={[styles.arrivalRow, pressAnim.animatedStyle]}>
      <Pressable
        onPressIn={pressAnim.onPressIn}
        onPressOut={pressAnim.onPressOut}
        style={styles.arrivalRowPressable}
      >
        {/* Dynamic colored route pip */}
        <View style={[styles.arrivalPip, { backgroundColor: lineColor }]} />

        <View style={styles.arrivalInfo}>
          <Text style={styles.arrivalDest} numberOfLines={1} ellipsizeMode="tail">
            {finalDest}
            {platformText ? (
              <Text style={styles.arrivalPlatformInline}>
                {`  ${platformText}`}
              </Text>
            ) : null}
          </Text>
          {arrival.branchName ? (
            <Text style={styles.branchText} numberOfLines={1} ellipsizeMode="tail">
              {arrival.branchName}
            </Text>
          ) : null}
        </View>

        <Text
          style={[
            styles.arrivalTimeStandard,
            { color: timeColor, fontWeight },
          ]}
          numberOfLines={1}
        >
          {isDue ? 'Due' : `${arrival.minutesAway} min`}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

interface StationDetailModalProps {
  visible: boolean;
  onClose: () => void;
  stationId: string;
  anchorRect: AnchorRect | null;
}

export function StationDetailModal({
  visible,
  onClose,
  stationId,
  anchorRect,
}: StationDetailModalProps) {
  const scale = useSharedValue(0.92);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(0);

  const titleRef = useRef<Text>(null);

  // Zustand stores
  const selectedLines = useUserPreferencesStore(state => state.selectedLines || []);
  const pinnedStations = useUserPreferencesStore(state => state.pinnedStations || []);
  const showAllDepartures = useUserPreferencesStore(state => state.stationFilterToggles[stationId] || false);
  const toggleFilter = useUserPreferencesStore(state => state.toggleStationFilter);
  const departuresFromStore = useStationDataStore(state => state.departures[stationId]);

  const insets = useSafeAreaInsets();
  const MIN_ALLOWED_TOP = insets.top + 12;

  const refreshPressAnim = usePressAnimation('back_btn', false);
  const filterPressAnim = usePressAnimation('line_select', false);

  // Transition freezing state
  const [freezeUpdates, setFreezeUpdates] = useState(true);
  const [snapshotData, setSnapshotData] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [freshnessString, setFreshnessString] = useState('Live');

  // ── Compute anchored position ──
  const popupLeft = (SCREEN_WIDTH - POPUP_WIDTH) / 2;
  const ESTIMATED_POPUP_HEIGHT = 280;

  const popupTop = useMemo(() => {
    if (!anchorRect) return SCREEN_HEIGHT / 2 - ESTIMATED_POPUP_HEIGHT / 2;
    const spaceBelow = SCREEN_HEIGHT - (anchorRect.y + anchorRect.height);
    if (spaceBelow < 300) {
      return Math.max(60, anchorRect.y - ESTIMATED_POPUP_HEIGHT - 8);
    }
    return anchorRect.y + anchorRect.height + 8;
  }, [anchorRect]);

  const safePopupTop = useMemo(() => {
    return Math.max(popupTop, MIN_ALLOWED_TOP);
  }, [popupTop, MIN_ALLOWED_TOP]);

  // Shift accessibility focus to station name header
  const focusOnTitle = useCallback(() => {
    if (titleRef.current) {
      const reactTag = findNodeHandle(titleRef.current);
      if (reactTag) {
        AccessibilityInfo.setAccessibilityFocus(reactTag);
      }
    }
  }, []);

  // Sync snapshot cache and trigger haptic scaling feedback
  useEffect(() => {
    if (visible) {
      setFreezeUpdates(true);
      const currentCache = useStationDataStore.getState().departures[stationId];
      setSnapshotData(currentCache);

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      // Start from anchor bottom
      const startOffset = anchorRect
        ? Math.min((anchorRect.y + anchorRect.height) - safePopupTop, 40)
        : 12;
      translateY.value = startOffset;
      scale.value = 0.92;
      opacity.value = 0;

      // Spring to final position
      translateY.value = withSpring(0, { damping: 18, stiffness: 200, overshootClamping: true }, (isFinished) => {
        if (isFinished) {
          runOnJS(setFreezeUpdates)(false);
          runOnJS(focusOnTitle)();
        }
      });
      scale.value = withSpring(1, { damping: 18, stiffness: 200, overshootClamping: true });
      opacity.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.poly(3)) });
    } else {
      scale.value = 0.92;
      opacity.value = 0;
      translateY.value = 0;
    }
  }, [visible, stationId, scale, opacity, translateY, focusOnTitle, anchorRect, safePopupTop]);

  // Freshness badge text mapping
  useEffect(() => {
    const updateFreshness = () => {
      if (!departuresFromStore) {
        setFreshnessString('Live');
        return;
      }
      const diffSec = (Date.now() - departuresFromStore.lastFetched) / 1000;
      if (diffSec <= 30) {
        setFreshnessString('Live');
      } else if (diffSec <= 60) {
        setFreshnessString('30s ago');
      } else {
        setFreshnessString('1m+ ago');
      }
    };

    updateFreshness();
    const interval = setInterval(updateFreshness, 10000);
    return () => clearInterval(interval);
  }, [departuresFromStore]);

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onClose();
  };

  const handleFilterToggle = () => {
    const nextState = !showAllDepartures;
    Haptics.impactAsync(
      nextState ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light
    ).catch(() => {});
    toggleFilter(stationId);
  };

  // Manual cache validation fetch
  const handleManualRefresh = async () => {
    try {
      setIsRefreshing(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

      const resolvedIds = resolveTflStopIds(stationId);
      const responses = await Promise.all(
        resolvedIds.map(id => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);
          return fetch(`${APP_CONFIG.BACKEND_URL}/api/stations/${id}`, { signal: controller.signal })
            .then(res => (res.ok ? res.json() : null))
            .catch(() => null)
            .finally(() => clearTimeout(timer));
        })
      );

      const allRawDepartures: any[] = [];
      responses.forEach(sData => {
        if (sData && Array.isArray(sData.departures)) {
          allRawDepartures.push(...sData.departures);
        }
      });

      const stationLineList = processStationArrivals(allRawDepartures, stationId);
      useStationDataStore.getState().setDepartures(stationId, stationLineList);
    } catch (e) {
      console.log('Manual refresh failed inside modal:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Active snapshot / live stream routing
  const activeData = freezeUpdates ? snapshotData : departuresFromStore;
  const cachedLines = useMemo(() => activeData?.lines || [], [activeData]);

  // Pinned station information
  const stationInfo = pinnedStations.find(s => s.id === stationId);
  const stationLines = stationInfo ? stationInfo.lines : [];

  // Hide ⊞ filter toggle if station services only 1 line
  const shouldShowFilterBtn = stationLines.length > 1;

  // Cognitive Sort Order rendering loop
  const sortedLines = useMemo(() => {
    if (!showAllDepartures) {
      return selectedLines
        .map(lineId => cachedLines.find((l: StationLineData) => l.lineId === lineId))
        .filter(Boolean) as StationLineData[];
    } else {
      return [...cachedLines].sort((a, b) => {
        const idxA = selectedLines.indexOf(a.lineId);
        const idxB = selectedLines.indexOf(b.lineId);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.lineName.localeCompare(b.lineName);
      });
    }
  }, [cachedLines, selectedLines, showAllDepartures]);

  // Clean title header station name — canonical util, shared with StationCard/ManageStationsModal
  const cleanTitleName = useMemo(() => {
    if (!stationInfo) return '';
    return tflCapitalise(cleanDisplayStationName(stationInfo.name));
  }, [stationInfo]);

  // Aligned empty states checks
  const hasDepartures = sortedLines.some((l: StationLineData) => l.arrivals.length > 0);
  const isAnyLineNightTube = cachedLines.some((l: StationLineData) => l.isNightTube);
  const emptyStateMessage = isAnyLineNightTube
    ? 'Night Tube active — service resuming shortly.'
    : 'Station service currently suspended.';

  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: popupLeft },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  if (!stationInfo) return null;

  return (
    <Modal
      visible={visible}
      transparent
      presentationStyle="overFullScreen"
      animationType="none"
      onRequestClose={handleClose}
    >
      <View style={styles.root}>
        {/* Whisper scrim — blocks underlying touch bleed */}
        <Pressable
          style={[StyleSheet.absoluteFillObject, styles.scrim]}
          onPress={handleClose}
          pointerEvents="auto"
          accessibilityRole="button"
          accessibilityLabel="Dismiss station details"
        />

        <Animated.View
          style={[styles.popupShadow, { top: safePopupTop }, cardAnimStyle]}
          accessibilityViewIsModal={true}
          importantForAccessibility="yes"
        >
          <Pressable style={styles.popup} onPress={(e) => e.stopPropagation()}>
            {Platform.OS !== 'android' && (
              <BlurView
                intensity={45}
                tint="dark"
                style={StyleSheet.absoluteFillObject}
              />
            )}

            <View style={styles.glassTint} pointerEvents="none" />

            {/* Header Layout Row */}
            <View style={styles.heroHeader}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
                <Text
                  ref={titleRef}
                  style={styles.stationName}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {cleanTitleName.toUpperCase()}
                </Text>

                {/* Freshness Badge */}
                <Animated.View style={refreshPressAnim.animatedStyle}>
                  <Pressable
                    onPress={handleManualRefresh}
                    onPressIn={refreshPressAnim.onPressIn}
                    onPressOut={refreshPressAnim.onPressOut}
                    style={styles.freshnessBadge}
                  >
                    {isRefreshing ? (
                      <ActivityIndicator size="small" color="#FFFFFF" style={{ transform: [{ scale: 0.7 }] }} />
                    ) : (
                      <Ionicons name="time-outline" size={12} color="#FFFFFF" />
                    )}
                    <Text style={styles.freshnessText}>{freshnessString}</Text>
                  </Pressable>
                </Animated.View>
              </View>

              {/* Opacity-toggled 44x44pt filter grid toggle button */}
              {shouldShowFilterBtn && (
                <Animated.View style={filterPressAnim.animatedStyle}>
                  <Pressable
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    style={[styles.filterBtn, { opacity: showAllDepartures ? 1.0 : 0.4 }]}
                    onPress={handleFilterToggle}
                    onPressIn={filterPressAnim.onPressIn}
                    onPressOut={filterPressAnim.onPressOut}
                    accessibilityLabel={showAllDepartures ? 'Switch to Pinned Lines filter' : 'Switch to All Departures filter'}
                    accessibilityRole="button"
                  >
                    <Ionicons name="grid-outline" size={20} color="#FFFFFF" />
                  </Pressable>
                </Animated.View>
              )}
            </View>

            {/* Body scroll area */}
            <ScrollView
              style={styles.bodyScroll}
              contentContainerStyle={styles.bodyScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {!hasDepartures ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>{emptyStateMessage}</Text>
                </View>
              ) : (
                sortedLines.map((line, idx) => {
                  const entering = idx < 6
                    ? FadeInUp.delay(idx * 50).springify().damping(18)
                    : undefined;

                  // Integrity-first chronological sort before cap
                  const sortedArrivals = [...line.arrivals].sort(
                    (a, b) => a.minutesAway - b.minutesAway
                  );

                  return (
                    <Animated.View
                      key={line.lineId}
                      layout={LinearTransition.springify().mass(0.8)}
                      entering={entering}
                      style={styles.lineSection}
                    >
                      {/* Line row header */}
                      <View style={styles.lineRowHeader}>
                        <View style={[styles.lineColorBar, { backgroundColor: line.lineColor }]} />
                        <Text style={styles.lineName} numberOfLines={1} ellipsizeMode="tail">
                          {line.lineName.toUpperCase()}
                        </Text>
                      </View>

                      {/* Arrivals mapping — capped at 3 per line */}
                      {sortedArrivals.length === 0 ? (
                        <Text style={styles.suspendedText}>No arrivals currently running</Text>
                      ) : (
                        <View style={styles.arrivalsList}>
                          {sortedArrivals.slice(0, 3).map((arrival, arrIdx) => {
                            const firstDueIndexInLine = sortedArrivals.findIndex(
                              (arr) => arr.minutesAway === 0
                            );
                            const isFirstDue = arrival.minutesAway === 0 && arrIdx === firstDueIndexInLine;
                            return (
                              <ArrivalRowItem
                                key={`${arrival.destination}-${arrIdx}`}
                                arrival={arrival}
                                lineColor={line.lineColor}
                                isFirstDue={isFirstDue}
                              />
                            );
                          })}
                        </View>
                      )}

                      {/* Timetable footer */}
                      {(line.isNightTube || (line.firstTrain && line.lastTrain)) && (
                        <View style={styles.lineFooter}>
                          {line.isNightTube ? (
                            <Text style={styles.lineFooterText} numberOfLines={1} ellipsizeMode="tail">
                              24hr Service
                            </Text>
                          ) : (
                            <Text style={styles.lineFooterText} numberOfLines={1} ellipsizeMode="tail">
                              First: {line.firstTrain} {line.firstTrainDestination || ''} │ Last: {line.lastTrain} {line.lastTrainDestination || ''}
                            </Text>
                          )}
                        </View>
                      )}
                    </Animated.View>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },

  popupShadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: POPUP_WIDTH,
    borderRadius: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 15,
  },

  popup: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    backgroundColor: Platform.OS === 'android' ? '#0E0E14' : 'rgba(255, 255, 255, 0.07)',
    padding: 0,
  },

  glassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 20,
  },

  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 8,
  },

  stationName: {
    fontSize: 15,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#FFFFFF',
    letterSpacing: 0.8,
    maxWidth: '55%',
  },

  filterBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },

  freshnessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },

  freshnessText: {
    fontSize: 10,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#FFFFFF',
  },

  bodyScroll: {
    maxHeight: SCREEN_HEIGHT * 0.45,
    marginHorizontal: 18,
  },

  bodyScrollContent: {
    paddingBottom: 18,
  },

  lineSection: {
    marginBottom: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 14,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
  },

  lineRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },

  lineColorBar: {
    width: 3,
    height: 13,
    borderRadius: 1.5,
    marginRight: 8,
  },

  lineName: {
    fontSize: 10,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },

  arrivalsList: {
    gap: 1,
  },

  arrivalRow: {
    overflow: 'visible',
  },

  arrivalRowPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 3,
    flex: 1,
  },

  arrivalPip: {
    width: 3,
    height: 12,
    borderRadius: 1.5,
    marginRight: 6,
    flexShrink: 0,
  },

  arrivalInfo: {
    flex: 1,
    marginRight: 10,
  },

  arrivalDest: {
    fontSize: 12,
    fontFamily: 'SpaceGrotesk_500Medium',
    color: 'rgba(255, 255, 255, 0.9)',
  },

  arrivalPlatformInline: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.35)',
  },

  branchText: {
    fontSize: 9,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255, 255, 255, 0.45)',
    marginTop: 1,
  },



  arrivalTimeStandard: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlign: 'right',
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
  },

  suspendedText: {
    fontSize: 11,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255, 255, 255, 0.35)',
    paddingVertical: 4,
  },

  lineFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
    marginTop: 8,
    paddingTop: 6,
  },

  lineFooterText: {
    fontSize: 9,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255, 255, 255, 0.38)',
  },

  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
  },

  emptyText: {
    fontSize: 12,
    fontFamily: 'SpaceGrotesk_500Medium',
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center',
  },
});
