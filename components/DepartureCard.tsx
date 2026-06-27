import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, Pressable, Platform, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  useReducedMotion,
  LinearTransition,
  FadeOut
} from 'react-native-reanimated';

import { LINE_COLORS } from '../constants/lineColors';
import { LINE_SHORT_NAMES } from '../data/lineMetadata';
import { useJiggle } from '../hooks/useJiggle';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { useStationDataStore } from '../store/stationDataStore';
import { usePressAnimation } from '../hooks/usePressAnimation';

// ─── Constants & Styling Tokens ──────────────────────────────────────────────
const TEXT_SECONDARY = 'rgba(255,255,255,0.4)';
const TEXT_GHOST = 'rgba(255,255,255,0.3)';

interface DepartureCardProps {
  stationId: string;
  stationName: string;
  isEditing?: boolean;
  onDelete?: (id: string) => void;
  onLongPress?: () => void;
  onPress?: () => void;
  defaultExpanded?: boolean;
  hideCard?: boolean;
  drag?: () => void;
  isActive?: boolean;
  index?: number;
}

const getDepTimeStyle = (minutes: number | 'now') => {
  if (minutes === 0 || minutes === 'now') {
    return { color: '#30D158', fontFamily: 'SpaceGrotesk_700Bold', fontWeight: '700' as const };
  }
  if (typeof minutes === 'number' && minutes <= 2) {
    return { color: 'rgba(255,255,255,0.85)', fontWeight: '500' as const };
  }
  return { color: 'rgba(255,255,255,0.55)', fontWeight: '500' as const };
};

export default function DepartureCard({
  stationId,
  stationName,
  isEditing = false,
  onDelete,
  onLongPress,
  onPress,
  defaultExpanded = false,
  hideCard = false,
  drag,
  isActive = false,
  index = 0,
}: DepartureCardProps) {
  const reducedMotion = useReducedMotion();
  const jiggleStyle = useJiggle(index, isEditing, isActive);
  const pressAnim = usePressAnimation('departure_card', isEditing || hideCard);

  // Global preferences and cached departures
  const selectedLines = useUserPreferencesStore(state => state.selectedLines || []);
  const pinnedStations = useUserPreferencesStore(state => state.pinnedStations || []);
  const cachedData = useStationDataStore(state => state.departures[stationId]);

  const [useNativeShimmer, setUseNativeShimmer] = useState(false);
  const [touchReady, setTouchReady] = useState(true);

  useEffect(() => {
    if (!isEditing) {
      setTouchReady(false);
      const t = setTimeout(() => setTouchReady(true), 150);
      return () => clearTimeout(t);
    }
  }, [isEditing]);
  const [contentHeight, setContentHeight] = useState(160);
  const heightVal = useSharedValue(160);
  const arrivalsOpacity = useSharedValue(1);

  // Cold launch shimmer logic: if data is empty, wait 3 seconds before showing native indicator
  useEffect(() => {
    if (!cachedData) {
      const timer = setTimeout(() => {
        setUseNativeShimmer(true);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setUseNativeShimmer(false);
    }
  }, [cachedData]);

  // Determine lines for placeholder shimmers
  const stationInfo = pinnedStations.find(s => s.id === stationId);
  const stationLines = stationInfo ? stationInfo.lines : [];
  const userLinesAtStation = stationLines.filter(lineId => selectedLines.includes(lineId));
  const shimmerLines = userLinesAtStation.length > 0 ? userLinesAtStation : stationLines.slice(0, 3);

  // Flatten and sort arrivals from cache
  const cachedLines = cachedData?.lines || [];
  const allArrivals = cachedLines.flatMap(line => 
    line.arrivals.map(arr => ({
      ...arr,
      lineId: line.lineId,
      lineName: line.lineName,
      lineColor: line.lineColor,
    }))
  );
  const sortedArrivals = allArrivals.sort((a, b) => a.minutesAway - b.minutesAway);
  const visibleArrivals = sortedArrivals.slice(0, 3);
  const isLoading = !cachedData;

  // Clean station name format
  const cleanName = String(stationName ?? '')
    .replace(/\s*(?:Underground Station|Elizabeth line Station|Overground Station|DLR Station|Rail Station|Station)$/i, '')
    .trim();

  const onInnerLayout = (event: any) => {
    const { height } = event.nativeEvent.layout;
    if (height > 0) {
      setContentHeight(height);
    }
  };

  useEffect(() => {
    const targetHeight = hideCard ? 0 : contentHeight;
    const targetOpacity = isEditing ? 0.3 : (hideCard ? 0 : 1);

    if (reducedMotion) {
      heightVal.value = targetHeight;
      arrivalsOpacity.value = targetOpacity;
    } else {
      heightVal.value = withSpring(targetHeight, { damping: 22, stiffness: 240 });

      if (isEditing) {
        arrivalsOpacity.value = withTiming(0.3, { duration: 150 });
      } else if (!hideCard) {
        arrivalsOpacity.value = withDelay(180, withTiming(1, { duration: 180 }));
      } else {
        arrivalsOpacity.value = withTiming(0, { duration: 100 });
      }
    }
  }, [isEditing, contentHeight, heightVal, arrivalsOpacity, hideCard, reducedMotion]);

  const containerStyle = useAnimatedStyle(() => {
    const opacityVal = reducedMotion ? (hideCard ? 0 : 1) : withTiming(hideCard ? 0 : 1, { duration: 150 });
    const marginVal = reducedMotion ? (hideCard ? 0 : 12) : withSpring(hideCard ? 0 : 12, { damping: 22, stiffness: 240 });
    const borderVal = reducedMotion ? (hideCard ? 0 : StyleSheet.hairlineWidth) : withTiming(hideCard ? 0 : StyleSheet.hairlineWidth, { duration: 100 });

    return {
      height: heightVal.value,
      opacity: opacityVal,
      marginBottom: marginVal,
      borderWidth: borderVal,
    };
  });

  const arrivalsStyle = useAnimatedStyle(() => ({
    opacity: arrivalsOpacity.value,
  }));

  const deleteScale = useSharedValue(isEditing ? 1 : 0);

  useEffect(() => {
    deleteScale.value = withSpring(isEditing ? 1 : 0, { damping: 15, stiffness: 180 });
  }, [isEditing, deleteScale]);

  const deleteBadgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: deleteScale.value }],
    opacity: deleteScale.value,
  }));

  const renderShimmerRows = () => {
    return shimmerLines.map((lineId, index) => {
      const lineColor = LINE_COLORS[lineId] || 'rgba(255,255,255,0.12)';
      const lineShortName = LINE_SHORT_NAMES[lineId] || lineId;
      return (
        <View key={`${lineId}-${index}`} style={[styles.arrivalRow, { opacity: 0.3 }]}>
          <View style={[styles.arrivalBar, { backgroundColor: lineColor }]} />
          <Text style={styles.arrivalLineName} numberOfLines={1}>
            {lineShortName}
          </Text>
          <View style={styles.arrivalDestContainer}>
            <View style={{ height: 10, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, width: '60%' }} />
          </View>
          <View style={{ height: 12, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, width: 24 }} />
        </View>
      );
    });
  };

  return (
    <Animated.View
      layout={isActive ? undefined : LinearTransition.springify().mass(0.8).damping(15)}
      exiting={FadeOut.duration(200)}
      style={[{ position: 'relative', overflow: 'visible' }, jiggleStyle]}
    >
      <Animated.View style={[styles.container, containerStyle, pressAnim.animatedStyle]}>
        <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View onLayout={onInnerLayout} style={styles.innerContent} pointerEvents="none">
          <View style={styles.headerPressable}>
            <View style={styles.header}>
              <View style={styles.titleColumn}>
                <Text
                  style={styles.stationName}
                  numberOfLines={1}
                >
                  {cleanName}
                </Text>
              </View>
            </View>
          </View>

          <Animated.View style={[styles.arrivalsContainer, arrivalsStyle]}>
            {isLoading ? (
              useNativeShimmer ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
                  <Text style={styles.loadingText}>Fetching departures...</Text>
                </View>
              ) : (
                <View style={{ paddingVertical: 5 }}>
                  {renderShimmerRows()}
                </View>
              )
            ) : visibleArrivals.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No trains in the next 30 minutes</Text>
              </View>
            ) : (
              visibleArrivals.map((a, i) => {
                const depVal = a.minutesAway === 0 ? 'now' : a.minutesAway;
                const depStyle = getDepTimeStyle(depVal);
                return (
                  <View
                    key={`${a.lineId}-${a.destination}-${a.minutesAway}-${i}`}
                    style={styles.arrivalRow}
                  >
                    <View style={[styles.arrivalBar, { backgroundColor: a.lineColor }]} />
                    <Text style={styles.arrivalLineName} numberOfLines={1} ellipsizeMode="tail">
                      {a.lineName}
                    </Text>
                    <View style={styles.arrivalDestContainer}>
                      <Text style={styles.arrivalDest} numberOfLines={1}>
                        {a.destination}
                        {a.platform ? (
                          <Text style={styles.arrivalPlatformInline}>
                            {`  ${a.platform.replace('Platform ', 'P')}`}
                          </Text>
                        ) : null}
                      </Text>
                    </View>
                    <Text style={[styles.arrivalTime, depStyle]}>
                      {depVal === 'now' || depVal === 0 ? 'Due' : `${depVal} min`}
                    </Text>
                  </View>
                );
              })
            )}
          </Animated.View>
        </View>
        <Pressable
          onPress={() => {
            if (isEditing || !touchReady) return;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            if (onPress) onPress();
          }}
          onLongPress={onLongPress}
          onPressIn={pressAnim.onPressIn}
          onPressOut={pressAnim.onPressOut}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>

      <Animated.View style={[styles.deleteBadgeContainer, deleteBadgeStyle]} pointerEvents={isEditing ? 'auto' : 'none'}>
        <Pressable
          style={styles.deleteBadge}
          hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            if (onDelete) {
              onDelete(stationId);
            }
          }}
        >
          <Text style={styles.deleteIcon}>−</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Platform.OS === 'android' ? 'rgba(30, 30, 40, 0.9)' : 'rgba(255, 255, 255, 0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 0,
    overflow: 'hidden', // Accordion clip!
  },
  innerContent: {
    width: '100%',
  },
  headerPressable: {
    paddingVertical: 9,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleColumn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  stationName: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  arrivalsContainer: {
    paddingBottom: 9,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  loadingText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: TEXT_SECONDARY,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  emptyText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: TEXT_GHOST,
  },
  arrivalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
  },
  arrivalBar: {
    width: 3,
    height: 12,
    borderRadius: 1.5,
    marginRight: 6,
    flexShrink: 0,
  },
  arrivalLineName: {
    width: 64,
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginRight: 8,
  },
  arrivalDestContainer: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    marginRight: 8,
  },
  arrivalDest: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 14,
  },
  arrivalPlatformInline: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
  },
  arrivalTime: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    color: '#FFFFFF',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  deleteBadgeContainer: {
    position: 'absolute',
    top: -6,
    right: -6,
    zIndex: 10,
  },
  deleteBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#1E1E1E',
  },
  deleteIcon: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: -2,
  },
});
