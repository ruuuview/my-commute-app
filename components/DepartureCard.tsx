import React, { useEffect, useState, useCallback } from 'react';
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
import { useRouter } from 'expo-router';
import { LINE_COLORS } from '../constants/lineColors';
import { resolveTflStopIds } from '../utils/resolveTflStopId';
import { normaliseLineId } from '../utils/normaliseLineId';
import { useJiggle } from '../hooks/useJiggle';
import { useUserPreferencesStore } from '../store/userPreferencesStore';

// ─── Constants & Styling Tokens ──────────────────────────────────────────────
const TEXT_SECONDARY = 'rgba(255,255,255,0.4)';
const TEXT_GHOST     = 'rgba(255,255,255,0.3)';
const DEPARTURE_COUNTDOWN = 'rgba(255,255,255,0.9)';

const cleanPlatformName = (platform: string): string => {
  if (!platform) return '';
  const match = platform.match(/Platform\s+[A-Za-z0-9]+/i);
  if (match) {
    return match[0].charAt(0).toUpperCase() + match[0].slice(1);
  }
  return platform;
};

// ─── Interfaces ──────────────────────────────────────────────────────────────
interface Arrival {
  lineId: string;
  lineName: string;
  lineColor: string;
  minutesAway: number;
  destination: string;
  expectedArrival: string;
  platform?: string;
}

interface DepartureCardProps {
  stationId: string;
  stationName: string;
  isEditing?: boolean;
  onDelete?: (id: string) => void;
  onLongPress?: () => void;
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
  defaultExpanded = false,
  hideCard = false,
  drag,
  isActive = false,
  index = 0,
}: DepartureCardProps) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const lastKnownData = useUserPreferencesStore(state => state.lastKnownData || []);
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [contentHeight, setContentHeight] = useState(160);
  const heightVal = useSharedValue(160);
  const arrivalsOpacity = useSharedValue(1);

  const jiggleStyle = useJiggle(index, isEditing, isActive);

  const visibleArrivals = arrivals.filter((a) => {
    const lineObj = lastKnownData.find((l) => l.id === a.lineId);
    if (lineObj) {
      const statusText = String(lineObj.status || '').toLowerCase();
      if (!statusText.includes('part') && (statusText.includes('closed') || statusText.includes('closure') || statusText.includes('suspended'))) {
        return false;
      }
    }
    return true;
  });

  // Fetch arrivals for this station
  const fetchArrivals = useCallback(async (active: { current: boolean }) => {
    try {
      const resolvedIds = resolveTflStopIds(stationId);
      const responses = await Promise.all(
        resolvedIds.map(id =>
          fetch(`https://my-commute-backend.vercel.app/api/stations/${id}`)
            .then(res => (res.ok ? res.json() : null))
            .catch(() => null)
        )
      );

      if (!active.current) return;

      const allRawDepartures: any[] = [];
      responses.forEach(sData => {
        if (sData && Array.isArray(sData.departures)) {
          allRawDepartures.push(...sData.departures);
        }
      });

      const dedupedRaw: any[] = [];
      const seenKeys = new Set<string>();

      allRawDepartures.forEach(dep => {
        const dest = String(dep.destination || '');
        if (dest.includes('DELETE') || dest.includes('⚠️')) {
          return;
        }
        const key = `${dep.line}-${dep.platform || dep.destination}-${dep.expected_arrival}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          dedupedRaw.push(dep);
        }
      });

      dedupedRaw.sort((a, b) => (a.minutes_away || 0) - (b.minutes_away || 0));

      const mappedArrivals = dedupedRaw.map((dep: any) => {
        const { lineId, cleanLineId } = normaliseLineId(dep.line);
        return {
          lineId,
          lineName: dep.line,
          lineColor: LINE_COLORS[cleanLineId] || '#888',
          minutesAway: dep.minutes_away,
          destination: String(dep.destination || '').replace(' Underground Station', '').replace(' DLR Station', ''),
          expectedArrival: dep.expected_arrival,
          platform: dep.platform ? cleanPlatformName(dep.platform) : '',
        };
      });

      if (!active.current) return;
      setArrivals(mappedArrivals);
      setLoading(false);
    } catch (err) {
      console.log('Error fetching in DepartureCard:', err);
    }
  }, [stationId]);

  useEffect(() => {
    const active = { current: true };
    fetchArrivals(active);
    // Poll arrivals every 30 seconds
    const interval = setInterval(() => fetchArrivals(active), 30000);
    return () => {
      active.current = false;
      clearInterval(interval);
    };
  }, [fetchArrivals]);

  // Format clean station name
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
    const borderVal = reducedMotion ? (hideCard ? 0 : 1) : withTiming(hideCard ? 0 : 1, { duration: 100 });

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

  return (
    <Animated.View
      layout={isActive ? undefined : LinearTransition.springify().mass(0.8).damping(15)}
      exiting={FadeOut.duration(200)}
      style={[{ position: 'relative', overflow: 'visible' }, jiggleStyle]}
    >
      <Animated.View style={[styles.container, containerStyle]}>
        <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View onLayout={onInnerLayout} style={styles.innerContent}>
          <Pressable
            onLongPress={onLongPress}
            delayLongPress={300}
            style={styles.headerPressable}
          >
            <View style={styles.header}>
              <View style={styles.titleColumn}>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push({
                      pathname: '/stationDetail',
                      params: { stationId, stationName },
                    });
                  }}
                >
                  {({ pressed }) => (
                    <Text
                      style={[
                        styles.stationName,
                        pressed && styles.stationNamePressed,
                      ]}
                      numberOfLines={1}
                    >
                      {cleanName}
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          </Pressable>

          <Animated.View style={[styles.arrivalsContainer, arrivalsStyle]}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
                <Text style={styles.loadingText}>Fetching departures...</Text>
              </View>
            ) : visibleArrivals.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No trains in the next 30 minutes</Text>
              </View>
            ) : (
              visibleArrivals.slice(0, 3).map((a, i) => {
                const depVal = a.minutesAway === 0 ? 'now' : a.minutesAway;
                const depStyle = getDepTimeStyle(depVal);
                return (
                  <View
                    key={`${a.lineId}-${a.destination}-${a.minutesAway}-${i}`}
                    style={styles.arrivalRow}
                  >
                    <View style={[styles.arrivalDot, { backgroundColor: a.lineColor }]} />
                    <Text style={styles.arrivalLineName} numberOfLines={1} ellipsizeMode="tail">
                      {a.lineName}
                    </Text>
                    <View style={styles.arrivalDestContainer}>
                      <Text style={styles.arrivalDest} numberOfLines={1}>
                        {a.destination}
                      </Text>
                      {a.platform ? (
                        <Text style={styles.arrivalPlatform} numberOfLines={1}>
                          {a.platform}
                        </Text>
                      ) : null}
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
      </Animated.View>

      <Animated.View style={[styles.deleteBadgeContainer, deleteBadgeStyle]} pointerEvents={isEditing ? 'auto' : 'none'}>
        <Pressable
          style={styles.deleteBadge}
          hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 0,
    overflow: 'hidden', // Accordion clip!
  },
  innerContent: {
    width: '100%',
  },
  headerPressable: {
    paddingVertical: 10,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 10,
  },
  titleColumn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stationName: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 15,
    color: '#FFFFFF',
  },
  stationNamePressed: {
    textDecorationLine: 'underline',
  },
  roleBadge: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 8,
    color: TEXT_SECONDARY,
    letterSpacing: 0.8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  nextTimeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: DEPARTURE_COUNTDOWN,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginRight: 8,
  },
  arrivalsContainer: {
    marginTop: 0,
    paddingTop: 6,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
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
  arrivalDot: {
    width: 3,
    height: 12,
    borderRadius: 1.5,
    marginRight: 8,
    flexShrink: 0,
  },
  arrivalLineName: {
    width: 72,
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
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
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 15,
  },
  arrivalPlatform: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 9.5,
    color: 'rgba(255,255,255,0.38)',
    marginTop: 1,
    lineHeight: 12,
  },
  arrivalTime: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
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
