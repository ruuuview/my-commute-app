import React, { useMemo, useEffect, useState, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
  Platform,
  PanResponder,
  AccessibilityInfo,
  findNodeHandle,
  ActivityIndicator
} from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
  runOnJS,
  FadeInUp,
  LinearTransition
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { useStationDataStore, StationLineData, ArrivalRow } from '../store/stationDataStore';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { processStationArrivals } from '../utils/groupStationDepartures';
import { resolveTflStopIds } from '../utils/resolveTflStopId';
import { APP_CONFIG } from '../config/app.config';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface StationDetailModalProps {
  visible: boolean;
  onClose: () => void;
  stationId: string;
}

export function StationDetailModal({
  visible,
  onClose,
  stationId,
}: StationDetailModalProps) {
  const cardScale = useSharedValue(0.92);
  const cardOpacity = useSharedValue(0);
  const translateY = useSharedValue(0);

  const titleRef = useRef<Text>(null);

  // Zustand stores
  const selectedLines = useUserPreferencesStore(state => state.selectedLines || []);
  const pinnedStations = useUserPreferencesStore(state => state.pinnedStations || []);
  const showAllDepartures = useUserPreferencesStore(state => state.stationFilterToggles[stationId] || false);
  const toggleFilter = useUserPreferencesStore(state => state.toggleStationFilter);
  const departuresFromStore = useStationDataStore(state => state.departures[stationId]);

  // Transition freezing state
  const [freezeUpdates, setFreezeUpdates] = useState(true);
  const [snapshotData, setSnapshotData] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [freshnessString, setFreshnessString] = useState('Live');

  // Shift accessibility focus to station name header
  const focusOnTitle = React.useCallback(() => {
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
      cardScale.value = withSpring(1, { damping: 22, stiffness: 260 }, (isFinished) => {
        if (isFinished) {
          runOnJS(setFreezeUpdates)(false);
          runOnJS(focusOnTitle)();
        }
      });
      cardOpacity.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.poly(3)) });
    } else {
      cardScale.value = withTiming(0.92, { duration: 160, easing: Easing.in(Easing.poly(2)) });
      cardOpacity.value = withTiming(0, { duration: 160 });
      translateY.value = 0; // reset drag
    }
  }, [visible, stationId, cardOpacity, cardScale, translateY, focusOnTitle]);

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

  // Pure Downward Swipe Dismissal responder
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 8 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.value = gestureState.dy;
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 120 || gestureState.vy > 0.8) {
          handleClose();
        } else {
          translateY.value = withSpring(0, { damping: 15, stiffness: 120 });
        }
      },
    })
  ).current;

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onClose();
  };

  // Manual cache validation fetch — uses shared utility that
  // deduplicates, sorts, groups by line+direction, caps at 3 per route,
  // and NEVER fabricates firstTrain/lastTrain values.
  const handleManualRefresh = async () => {
    try {
      setIsRefreshing(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

      const resolvedIds = resolveTflStopIds(stationId);
      const responses = await Promise.all(
        resolvedIds.map(id =>
          fetch(`${APP_CONFIG.BACKEND_URL}/api/stations/${id}`)
            .then(res => (res.ok ? res.json() : null))
            .catch(() => null)
        )
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

  // Clean title header station name
  const cleanTitleName = useMemo(() => {
    if (!stationInfo) return '';
    return String(stationInfo.name)
      .replace(/\s*(?:Underground Station|Elizabeth line Station|Overground Station|DLR Station|Rail Station|Station)$/i, '')
      .trim();
  }, [stationInfo]);

  // Aligned empty states checks
  const hasDepartures = sortedLines.some((l: StationLineData) => l.arrivals.length > 0);
  const isAnyLineNightTube = cachedLines.some((l: StationLineData) => l.isNightTube);
  const emptyStateMessage = isAnyLineNightTube
    ? 'Night Tube active — service resuming shortly.'
    : 'Station service currently suspended.';

  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: cardScale.value },
      { translateY: translateY.value }
    ],
    opacity: cardOpacity.value,
  }));

  if (!stationInfo) return null;

  return (
    <Modal
      visible={visible}
      transparent
      presentationStyle="overFullScreen"
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.root}>
        {/* Android Solid color fallback to maintain frame rates */}
        {Platform.OS === 'android' ? (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(10, 10, 15, 0.96)' }]} />
        ) : (
          <BlurView
            intensity={80}
            tint="dark"
            style={StyleSheet.absoluteFillObject}
          />
        )}

        <View style={styles.scrim} />

        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss station details"
          pointerEvents="auto"
        />

        <Animated.View 
          style={[styles.cardShadowLayer, cardAnimStyle]}
          accessibilityViewIsModal={true}
          importantForAccessibility="yes"
          {...panResponder.panHandlers}
        >
          <View style={styles.card}>
            {Platform.OS !== 'android' && (
              <BlurView
                intensity={80}
                tint="dark"
                style={StyleSheet.absoluteFillObject}
              />
            )}

            <View style={styles.glassTint} pointerEvents="none" />
            
            {/* Drag Handle visually anchoring downward swipe */}
            <View style={styles.dragHandleWrapper}>
              <View style={styles.dragHandle} />
            </View>

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

                {/* Freshness Badge Vector Component Wrapper */}
                <Pressable
                  onPress={handleManualRefresh}
                  style={({ pressed }) => [
                    styles.freshnessBadge,
                    { opacity: pressed ? 1.0 : 0.4 }
                  ]}
                >
                  {isRefreshing ? (
                    <ActivityIndicator size="small" color="#FFFFFF" style={{ transform: [{ scale: 0.7 }] }} />
                  ) : (
                    <Ionicons name="time-outline" size={12} color="#FFFFFF" />
                  )}
                  <Text style={styles.freshnessText}>{freshnessString}</Text>
                </Pressable>

                {freshnessString === '1m+ ago' && !isRefreshing && (
                  <Pressable onPress={handleManualRefresh} style={styles.retryLink}>
                    <Text style={styles.retryText}>Tap to retry</Text>
                  </Pressable>
                )}
              </View>

              {/* Opacity-toggled 44x44pt filter grid toggle button */}
              {shouldShowFilterBtn && (
                <Pressable
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={[styles.filterBtn, { opacity: showAllDepartures ? 1.0 : 0.4 }]}
                  onPress={() => toggleFilter(stationId)}
                  accessibilityLabel={showAllDepartures ? 'Switch to Pinned Lines filter' : 'Switch to All Departures filter'}
                  accessibilityRole="button"
                >
                  <Ionicons name="grid-outline" size={20} color="#FFFFFF" />
                </Pressable>
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

                      {/* Arrivals mapping — grouped cleanly by destination,
                          capped at 3 trains per direction */}
                      {line.arrivals.length === 0 ? (
                        <Text style={styles.suspendedText}>No arrivals currently running</Text>
                      ) : (
                        <View style={styles.arrivalsList}>
                          {line.arrivals.map((arrival: ArrivalRow, arrIdx: number) => (
                            <View key={`${arrival.destination}-${arrIdx}`} style={styles.arrivalRow}>
                              <View style={styles.arrivalDestCol}>
                                <Text style={styles.arrivalDest}>
                                  {arrival.destination}
                                </Text>
                                {arrival.branchName ? (
                                  <Text style={styles.branchText}>
                                    {arrival.branchName}
                                  </Text>
                                ) : null}
                              </View>
                              <Text style={styles.arrivalTime}>
                                {arrival.minutesAway === 0 ? 'Due' : `${arrival.minutesAway} min`}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Timetable operational bounds footer — only renders
                          when the backend explicitly supplies real data */}
                      <View style={styles.lineFooter}>
                        {line.isNightTube ? (
                          <Text style={styles.lineFooterText}>
                            Night Tube active — 24hr Service
                          </Text>
                        ) : line.firstTrain && line.lastTrain ? (
                          <Text style={styles.lineFooterText}>
                            First: {line.firstTrain} {line.firstTrainDestination || ''} │ Last: {line.lastTrain} {line.lastTrainDestination || ''}
                          </Text>
                        ) : null}
                      </View>
                    </Animated.View>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.divider} />

            <View style={styles.dismissHintWrapper}>
              <Text style={styles.dismissHintText}>Swipe down or tap outside to dismiss</Text>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    pointerEvents: 'none',
  },
  cardShadowLayer: {
    width: '90%',
    maxWidth: 390,
    maxHeight: SCREEN_HEIGHT * 0.75,
    borderRadius: 26,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.60,
    shadowRadius: 32,
    elevation: 20,
  },
  card: {
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    backgroundColor: Platform.OS === 'android' ? '#0E0E14' : 'rgba(255, 255, 255, 0.04)',
    padding: 0,
  },
  glassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 26,
  },
  dragHandleWrapper: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 10,
  },
  stationName: {
    fontSize: 16,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#FFFFFF',
    letterSpacing: 0.8,
    maxWidth: '55%',
  },
  filterBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  freshnessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  freshnessText: {
    fontSize: 10,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#FFFFFF',
  },
  retryLink: {
    marginLeft: 4,
  },
  retryText: {
    fontSize: 10,
    fontFamily: 'SpaceGrotesk_500Medium',
    color: '#0098D4',
  },
  bodyScroll: {
    maxHeight: SCREEN_HEIGHT * 0.5,
    marginHorizontal: 24,
  },
  bodyScrollContent: {
    paddingBottom: 12,
  },
  lineSection: {
    marginBottom: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  lineRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  lineColorBar: {
    width: 3.5,
    height: 14,
    borderRadius: 1.5,
    marginRight: 8,
  },
  lineName: {
    fontSize: 11,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
  arrivalsList: {
    gap: 8,
  },
  arrivalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  arrivalDestCol: {
    flex: 1,
    marginRight: 12,
  },
  arrivalDest: {
    fontSize: 12,
    fontFamily: 'SpaceGrotesk_500Medium',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  branchText: {
    fontSize: 9,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255, 255, 255, 0.45)',
    marginTop: 1,
  },
  arrivalTime: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#30D158',
    textAlign: 'right',
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
    marginTop: 10,
    paddingTop: 8,
  },
  lineFooterText: {
    fontSize: 9,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255, 255, 255, 0.38)',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 12,
    fontFamily: 'SpaceGrotesk_500Medium',
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  dismissHintWrapper: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    alignItems: 'center',
  },
  dismissHintText: {
    fontSize: 10,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255, 255, 255, 0.25)',
    letterSpacing: 0.3,
  },
});
