/**
 * DepartureCard.tsx
 * ─────────────────────────────────────────────────────────────────
 * Collapsed departure card (station name + next train countdown).
 * Tap → calls onCardTap (opens StationDetailModal via DashboardGrid).
 * Long-press → triggers jiggle/edit mode in parent.
 * hideCard = true → collapses to height 0 (search-active state).
 *
 * PRESERVED:
 *  • usePressAnimation for tactile scale feedback
 *  • hideCard search-collapse Reanimated logic
 *  • isEditing delete badge
 * ─────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  useReducedMotion,
} from 'react-native-reanimated';
import { LINE_COLORS } from '../constants/lineColors';
import { IMMINENT_BLUE } from '../theme/colors';
import { resolveTflStopIds } from '../utils/resolveTflStopId';
import { normaliseLineId } from '../utils/normaliseLineId';
import { usePressAnimation } from '../hooks/usePressAnimation';

// ─── Constants ────────────────────────────────────────────────────
const DEPARTURE_COUNTDOWN = 'rgba(255,255,255,0.9)';
const COLLAPSED_HEIGHT = 56;

// ─── Interfaces ──────────────────────────────────────────────────
interface Arrival {
  lineId: string;
  lineName: string;
  lineColor: string;
  minutesAway: number;
  destination: string;
  expectedArrival: string;
}

export interface DepartureCardProps {
  stationId: string;
  stationName: string;
  isEditing?: boolean;
  onDelete?: (id: string) => void;
  onLongPress?: () => void;
  /** Called when user taps the card — parent opens StationDetailModal */
  onCardTap?: (stationId: string, stationName: string) => void;
  /** Set true when the search bar is active (Screen 2 collapse logic) */
  hideCard?: boolean;
  /** Only show arrivals for these line IDs */
  selectedLines?: string[];
}

// ─── Imminent countdown blink ─────────────────────────────────────
function ImminentCountdown({
  text,
  style,
}: {
  text: string;
  style?: any;
}) {
  const opacity = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;
    opacity.value = withRepeat(withTiming(0.35, { duration: 600 }), -1, true);
  }, [reducedMotion, opacity]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.Text style={[style, { color: IMMINENT_BLUE }, animStyle]} numberOfLines={1}>
      {text}
    </Animated.Text>
  );
}

// ─── Main component ──────────────────────────────────────────────
export default function DepartureCard({
  stationId,
  stationName,
  isEditing = false,
  onDelete,
  onLongPress,
  onCardTap,
  hideCard = false,
  selectedLines,
}: DepartureCardProps) {
  const reducedMotion = useReducedMotion();
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [loading, setLoading] = useState(true);

  // Press animation — governs tactile scale feel (DO NOT REMOVE)
  const pressAnim = usePressAnimation('departure_card');

  // Height shared value — drives hideCard collapse animation
  const heightVal = useSharedValue(hideCard ? 0 : COLLAPSED_HEIGHT);

  // ── Fetch live arrivals ───────────────────────────────────────
  const fetchArrivals = useCallback(
    async (active: { current: boolean }) => {
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

        const allRaw: any[] = [];
        responses.forEach(sData => {
          if (sData?.departures) allRaw.push(...sData.departures);
        });

        const seen = new Set<string>();
        const deduped = allRaw.filter(dep => {
          const dest = String(dep.destination || '');
          if (dest.includes('DELETE') || dest.includes('⚠️')) return false;
          const key = `${dep.line}-${dep.platform || dep.destination}-${dep.expected_arrival}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        deduped.sort((a, b) => (a.minutes_away || 0) - (b.minutes_away || 0));

        const mapped = deduped.map((dep: any) => {
          const { lineId, cleanLineId } = normaliseLineId(dep.line);
          return {
            lineId,
            lineName: dep.line,
            lineColor: LINE_COLORS[cleanLineId] || '#888',
            minutesAway: dep.minutes_away,
            destination: String(dep.destination || '')
              .replace(' Underground Station', '')
              .replace(' DLR Station', '')
              .replace(/\b(Northbound|Southbound|Eastbound|Westbound)\b\s*[-–—]?\s*/gi, '')
              .trim(),
            expectedArrival: dep.expected_arrival,
          };
        });

        // Filter by selectedLines if provided
        const filtered = selectedLines?.length
          ? mapped.filter(a => selectedLines.includes(a.lineId))
          : mapped;

        if (!active.current) return;
        setArrivals(filtered);
        setLoading(false);
      } catch (err) {
        console.log('[DepartureCard] fetch error:', err);
      }
    },
    [stationId, selectedLines]
  );

  useEffect(() => {
    const active = { current: true };
    fetchArrivals(active);
    const interval = setInterval(() => fetchArrivals(active), 30_000);
    return () => {
      active.current = false;
      clearInterval(interval);
    };
  }, [fetchArrivals]);

  // ── Derived values ───────────────────────────────────────────
  const cleanName = String(stationName ?? '')
    .replace(
      /\s*(?:Underground Station|Elizabeth line Station|Overground Station|DLR Station|Rail Station|Station)$/i,
      ''
    )
    .trim();

  const nextTimeText = useMemo(() => {
    if (loading) return '...';
    if (arrivals.length === 0) return 'No trains';
    const a = arrivals[0];
    return a.minutesAway === 0 ? 'Due' : `${a.minutesAway} min`;
  }, [loading, arrivals]);

  const isFirstDue = !loading && arrivals.length > 0 && arrivals[0].minutesAway === 0;

  const isImminent =
    !loading && arrivals.length > 0 && arrivals[0].minutesAway <= 2;

  // ── Search-collapse animation (hideCard prop) ─────────────────
  useEffect(() => {
    const targetH = hideCard ? 0 : COLLAPSED_HEIGHT;
    if (reducedMotion) {
      heightVal.value = targetH;
    } else {
      heightVal.value = withSpring(targetH, { damping: 22, stiffness: 240 });
    }
  }, [hideCard, heightVal, reducedMotion]);

  const containerStyle = useAnimatedStyle(() => {
    const opacityVal = reducedMotion
      ? hideCard ? 0 : 1
      : withTiming(hideCard ? 0 : 1, { duration: 150 });
    const marginVal = reducedMotion
      ? hideCard ? 0 : 12
      : withSpring(hideCard ? 0 : 12, { damping: 22, stiffness: 240 });
    const borderVal = reducedMotion
      ? hideCard ? 0 : 1
      : withTiming(hideCard ? 0 : 1, { duration: 100 });
    return {
      height: heightVal.value,
      opacity: opacityVal,
      marginBottom: marginVal,
      borderWidth: borderVal,
    };
  });

  // ── Tap handler → open popup via parent callback ──────────────
  const handlePress = () => {
    if (isEditing) return; // Ignore taps while in jiggle/edit mode
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCardTap?.(stationId, stationName);
  };

  return (
    <Animated.View
      style={[styles.container, containerStyle, pressAnim.animatedStyle]}
      testID={`departure-card-${stationId}`}
    >
      <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFillObject} />

      <View style={styles.innerContent}>
        <Pressable
          onPress={handlePress}
          onLongPress={onLongPress}
          onPressIn={pressAnim.onPressIn}
          onPressOut={pressAnim.onPressOut}
          style={styles.headerPressable}
          testID={`departure-card-pressable-${stationId}`}
        >
          <View style={styles.header}>
            {/* Station name */}
            <View style={styles.titleColumn}>
              <Text style={styles.stationName} numberOfLines={1}>
                {cleanName}
              </Text>
            </View>

            {/* Collapsed header: next train + forward chevron */}
            {!isEditing && (
              <View style={styles.headerRight}>
                {arrivals.length > 0 && (
                  <Text style={styles.lineName} numberOfLines={1}>
                    {arrivals[0].lineName}
                  </Text>
                )}
                {isImminent && !isFirstDue ? (
                  <ImminentCountdown
                    text={nextTimeText}
                    style={styles.nextTimeText}
                  />
                ) : isFirstDue ? (
                  <Text style={[styles.nextTimeText, styles.dueGreen]}>{nextTimeText}</Text>
                ) : (
                  <Text style={styles.nextTimeText}>{nextTimeText}</Text>
                )}
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color="rgba(255,255,255,0.25)"
                />
              </View>
            )}

            {/* Edit mode: delete badge */}
            {isEditing && onDelete && (
              <Pressable
                style={styles.deleteBadge}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onDelete(stationId);
                }}
                testID={`departure-card-delete-${stationId}`}
              >
                <Text style={styles.deleteIcon}>−</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </View>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 0,
    marginBottom: 12,
    overflow: 'hidden',
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nextTimeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: DEPARTURE_COUNTDOWN,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  dueGreen: {
    color: '#30D158',
    fontWeight: '700',
  },
  lineName: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    marginRight: 4,
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
