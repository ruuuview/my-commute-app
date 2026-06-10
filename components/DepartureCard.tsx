import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { StyleSheet, View, Text, Pressable, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, withDelay, withRepeat, useReducedMotion } from 'react-native-reanimated';
import { LINE_COLORS } from '../constants/lineColors';
import { IMMINENT_BLUE } from '../theme/colors';
import { resolveTflStopIds } from '../utils/resolveTflStopId';
import { normaliseLineId } from '../utils/normaliseLineId';

// ─── Constants & Styling Tokens ──────────────────────────────────────────────
const TEXT_SECONDARY = 'rgba(255,255,255,0.4)';
const TEXT_GHOST     = 'rgba(255,255,255,0.3)';
const DEPARTURE_COUNTDOWN = 'rgba(255,255,255,0.9)';



// ─── Interfaces ──────────────────────────────────────────────────────────────
interface Arrival {
  lineId: string;
  lineName: string;
  lineColor: string;
  minutesAway: number;
  destination: string;
  expectedArrival: string;
}

interface DepartureCardProps {
  stationId: string;
  stationName: string;
  role?: 'home' | 'work' | 'other';
  isEditing?: boolean;
  onDelete?: (id: string) => void;
  onLongPress?: () => void;
  autoExpand?: boolean;
  hideCard?: boolean;
}

const getDepTimeStyle = (minutes: number | 'now') => {
  if (minutes === 0 || minutes === 'now') {
    return { color: IMMINENT_BLUE, fontWeight: '700' as const };
  }
  if (typeof minutes === 'number' && minutes <= 2) {
    return { color: IMMINENT_BLUE, fontWeight: '700' as const };
  }
  if (typeof minutes === 'number' && minutes <= 9) {
    return { color: 'rgba(255,255,255,0.90)', fontWeight: '700' as const };
  }
  return { color: 'rgba(255,255,255,0.45)', fontWeight: '700' as const };
};

function ImminentCountdown({ text, color, style }: { text: string; color: string; style?: any }) {
  const opacity = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;
    opacity.value = withRepeat(
      withTiming(0.4, { duration: 600 }),
      -1,
      true
    );
  }, [reducedMotion, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.Text
      style={[
        style,
        { color },
        animatedStyle,
      ]}
      numberOfLines={1}
    >
      {text}
    </Animated.Text>
  );
}

const COLLAPSED_HEIGHT = 56;

export default function DepartureCard({
  stationId,
  stationName,
  role,
  isEditing = false,
  onDelete,
  onLongPress,
  autoExpand = true,
  hideCard = false,
}: DepartureCardProps) {
  const reducedMotion = useReducedMotion();
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(autoExpand);
  
  const [contentHeight, setContentHeight] = useState(160);
  const heightVal = useSharedValue(autoExpand ? 160 : COLLAPSED_HEIGHT);
  const chevronRotation = useSharedValue(autoExpand ? 180 : 0);
  const arrivalsOpacity = useSharedValue(autoExpand ? 1 : 0);

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

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsExpanded(prev => !prev);
  };

  const onInnerLayout = (event: any) => {
    const { height } = event.nativeEvent.layout;
    if (height > COLLAPSED_HEIGHT) {
      setContentHeight(height);
    }
  };



  // Format next time string for the collapsed view
  const nextTimeText = useMemo(() => {
    if (loading) return '...';
    if (arrivals.length === 0) return 'No departures';
    const a = arrivals[0];
    return a.minutesAway === 0 ? 'Due' : `${a.minutesAway} min`;
  }, [loading, arrivals]);

  useEffect(() => {
    const targetHeight = hideCard ? 0 : (isExpanded ? contentHeight : COLLAPSED_HEIGHT);
    if (reducedMotion) {
      heightVal.value = targetHeight;
      chevronRotation.value = isExpanded && !hideCard ? 180 : 0;
      arrivalsOpacity.value = isExpanded && !hideCard ? 1 : 0;
    } else {
      heightVal.value = withSpring(targetHeight, { damping: 22, stiffness: 240 });
      chevronRotation.value = withSpring(isExpanded && !hideCard ? 180 : 0, { damping: 22, stiffness: 240 });
      
      if (isExpanded && !hideCard) {
        arrivalsOpacity.value = withDelay(180, withTiming(1, { duration: 180 }));
      } else {
        arrivalsOpacity.value = withTiming(0, { duration: 100 });
      }
    }
  }, [isExpanded, contentHeight, heightVal, chevronRotation, arrivalsOpacity, hideCard, reducedMotion]);

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

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value}deg` }],
  }));


  const arrivalsStyle = useAnimatedStyle(() => ({
    opacity: arrivalsOpacity.value,
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFillObject} />
      <View onLayout={onInnerLayout} style={styles.innerContent}>
        <Pressable
          onPress={handlePress}
          onLongPress={onLongPress}
          style={styles.headerPressable}
        >
          <View style={styles.header}>
            <View style={styles.titleColumn}>
              <Text style={styles.stationName} numberOfLines={1}>
                {cleanName}
              </Text>
            </View>

            {!isEditing && (
              <View style={styles.headerRight}>
                {arrivals.length > 0 && arrivals[0].minutesAway <= 2 ? (
                  <ImminentCountdown
                    text={nextTimeText}
                    color={IMMINENT_BLUE}
                    style={styles.nextTimeText}
                  />
                ) : (
                  <Text style={styles.nextTimeText}>
                    {nextTimeText}
                  </Text>
                )}
                <Animated.View style={chevronStyle}>
                  <Ionicons
                    name="chevron-down"
                    size={16}
                    color="rgba(255,255,255,0.3)"
                  />
                </Animated.View>
              </View>
            )}

            {isEditing && onDelete && (
              <Pressable
                style={styles.deleteBadge}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onDelete(stationId);
                }}
              >
                <Text style={styles.deleteIcon}>−</Text>
              </Pressable>
            )}
          </View>
        </Pressable>

        <Animated.View style={[styles.arrivalsContainer, arrivalsStyle]}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
              <Text style={styles.loadingText}>Fetching departures...</Text>
            </View>
          ) : arrivals.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No trains in the next 30 minutes</Text>
            </View>
          ) : (
            arrivals.slice(0, 3).map((a, i) => {
              const depVal = a.minutesAway === 0 ? 'now' : a.minutesAway;
              const depStyle = getDepTimeStyle(depVal);
              const isImminent = depVal === 'now' || (typeof depVal === 'number' && depVal <= 2);
              return (
                <View
                  key={`${a.lineId}-${a.destination}-${a.minutesAway}-${i}`}
                  style={styles.arrivalRow}
                >
                  <View style={[styles.arrivalDot, { backgroundColor: a.lineColor }]} />
                  <Text style={styles.arrivalLineName} numberOfLines={1} ellipsizeMode="tail">
                    {a.lineName}
                  </Text>
                  <Text style={styles.arrivalDest} numberOfLines={1}>
                    {a.destination}
                  </Text>
                  {isImminent ? (
                    <ImminentCountdown
                      text={depVal === 'now' ? 'Due' : `${depVal} min`}
                      color={IMMINENT_BLUE}
                      style={styles.arrivalTime}
                    />
                  ) : (
                    <Text style={[styles.arrivalTime, depStyle]}>
                      {`${depVal} min`}
                    </Text>
                  )}
                </View>
              );
            })
          )}
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 0,
    marginBottom: 12,
    overflow: 'hidden', // Accordion clip!
  },
  innerContent: {
    width: '100%',
  },
  headerPressable: {
    height: COLLAPSED_HEIGHT,
    justifyContent: 'center',
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
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
    paddingTop: 8,
    paddingBottom: 14,
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
    gap: 8,
  },
  arrivalDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  arrivalLineName: {
    width: 72,
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  arrivalDest: {
    flex: 1,
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
  },
  arrivalTime: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: '#FFFFFF',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  deleteBadge: {
    position: 'absolute',
    top: -6,
    left: -6,
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

