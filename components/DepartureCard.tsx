/**
 * DepartureCard.tsx
 * ─────────────────────────────────────────────────────────────────
 * Expanded departure card showing station header + up to 3 arrival rows.
 * Tap → calls onCardTap (opens StationDetailScreen via router push).
 * Long-press → triggers jiggle/edit mode in parent.
 *
 * PRESERVED:
 *  • usePressAnimation for tactile scale feedback
 *  • hideCard search-collapse Reanimated logic
 *  • isEditing delete badge
 * ─────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useReducedMotion,
  SharedValue,
} from 'react-native-reanimated';
import { LINE_COLORS } from '../constants/lineColors';
import { resolveTflStopIds } from '../utils/resolveTflStopId';
import { normaliseLineId } from '../utils/normaliseLineId';
import { usePressAnimation } from '../hooks/usePressAnimation';
import { useJiggle } from '../hooks/useJiggle';
import { APP_CONFIG } from '../config/app.config';
import { GLASS } from '../theme/colors';

// ─── Constants ────────────────────────────────────────────────────
const DUE_GREEN = '#30D158';
const MAX_ROWS = 3;

// ─── Interfaces ──────────────────────────────────────────────────
interface Arrival {
  lineId: string;
  lineName: string;
  lineColor: string;
  minutesAway: number;
  destination: string;
  platform: string;
  expectedArrival: string;
}

export interface DepartureCardProps {
  stationId: string;
  stationName: string;
  isEditing?: boolean;
  onDelete?: (id: string) => void;
  onLongPress?: () => void;
  onCardTap?: (stationId: string, stationName: string) => void;
  hideCard?: boolean;
  selectedLines?: string[];
  drag?: () => void;
  index?: number;
  isActive?: boolean;
  globalJiggle?: SharedValue<number>;
}

// ─── Helper: clean platform text ─────────────────────────────────
function cleanPlatform(platform: string): string {
  if (!platform) return '';
  return String(platform)
    .replace(/\b(Northbound|Southbound|Eastbound|Westbound)\b\s*[-–—]?\s*/gi, '')
    .replace(/Platform\s*/i, 'P')
    .trim();
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
  drag,
  index = 0,
  isActive = false,
  globalJiggle,
}: DepartureCardProps) {
  const reducedMotion = useReducedMotion();
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [loading, setLoading] = useState(true);

  const pressAnim = usePressAnimation('departure_card');
  const jiggleStyle = useJiggle(isEditing, isActive, globalJiggle, {
    baselineShadowOpacity: GLASS.shadowOpacity,
    baselineShadowRadius: GLASS.shadowRadius,
    baselineElevation: 0,
  });

  // ── Fetch live arrivals ───────────────────────────────────────
  const fetchArrivals = useCallback(
    async (active: { current: boolean }) => {
      try {
        const resolvedIds = resolveTflStopIds(stationId);
        const responses = await Promise.all(
          resolvedIds.map(id =>
            fetch(`${APP_CONFIG.BACKEND_URL}/api/stations/${id}`)
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
          
          // Collapse all minutes_away <= 0 (e.g. Due) to the same key to prevent duplicate due trains on the same platform
          const mins = dep.minutes_away ?? 0;
          const dueKey = mins <= 0 ? 'due' : mins;
          const key = `${dep.line}-${dep.platform || dep.destination}-${dueKey}`;
          
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
            platform: String(dep.platform || ''),
            expectedArrival: dep.expected_arrival,
          };
        });

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

  const displayArrivals = arrivals.slice(0, MAX_ROWS);

  // ── Search-collapse animation (hideCard prop) ─────────────────
  const collapseOpacity = useSharedValue(hideCard ? 0 : 1);
  const collapseMargin = useSharedValue(hideCard ? 0 : 12);

  useEffect(() => {
    if (reducedMotion) {
      collapseOpacity.value = hideCard ? 0 : 1;
      collapseMargin.value = hideCard ? 0 : 12;
    } else {
      collapseOpacity.value = withTiming(hideCard ? 0 : 1, { duration: 150 });
      collapseMargin.value = withSpring(hideCard ? 0 : 12, { damping: 22, stiffness: 240 });
    }
  }, [hideCard, reducedMotion, collapseOpacity, collapseMargin]);

  const containerAnimStyle = useAnimatedStyle(() => ({
    opacity: collapseOpacity.value,
    marginBottom: collapseMargin.value,
  }));

  // ── Tap handler ───────────────────────────────────────────────
  const handlePress = () => {
    if (isEditing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCardTap?.(stationId, stationName);
  };

  if (hideCard) return null;

  return (
    <Animated.View
      style={[styles.container, containerAnimStyle, jiggleStyle]}
      testID={`departure-card-${stationId}`}
    >
      <Animated.View style={[{ flex: 1 }, pressAnim.animatedStyle]}>
        <BlurView intensity={GLASS.blurIntensity} tint="dark" style={StyleSheet.absoluteFillObject} />

        <Pressable
          onPress={handlePress}
          onLongPress={onLongPress}
          onPressIn={() => {
            if (isEditing && drag) {
              drag();
            } else if (!isEditing) {
              pressAnim.onPressIn();
            }
          }}
          onPressOut={() => {
            if (!isEditing) pressAnim.onPressOut();
          }}
          style={styles.pressable}
          testID={`departure-card-pressable-${stationId}`}
        >
          {/* Station header */}
          <View style={styles.headerRow}>
            <Text style={styles.stationName} numberOfLines={1}>{cleanName}</Text>

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

          {/* Subtle glass divider to give definition to the station name */}
          <View style={styles.divider} />

          {/* Departure rows */}
          {loading ? (
            <Text style={styles.loadingText}>...</Text>
          ) : displayArrivals.length === 0 ? (
            <Text style={styles.emptyText}>No upcoming departures</Text>
          ) : (
            displayArrivals.map((arr, idx) => {
              const isDue = arr.minutesAway <= 0;
              const timeText = isDue ? 'Due' : `${arr.minutesAway} min`;
              const platform = cleanPlatform(arr.platform);

              return (
                <View key={`${arr.lineId}-${idx}`} style={styles.arrivalRow} testID={`departure-row-${idx}`}>
                  <View style={[styles.lineBar, { backgroundColor: arr.lineColor }]} />
                  <Text style={styles.arrLineName} numberOfLines={1}>
                    {arr.lineName}
                  </Text>
                  <View style={styles.destPlatform}>
                    <Text style={styles.arrDest} numberOfLines={1}>
                      {arr.destination}
                    </Text>
                    {platform ? (
                      <Text style={styles.arrPlatform} numberOfLines={1}>
                        {platform}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[styles.arrTime, isDue && styles.arrTimeDue]} numberOfLines={1}>
                    {timeText}
                  </Text>
                </View>
              );
            })
          )}
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    backgroundColor: Platform.OS === 'android' ? '#0E0E14' : 'rgba(255, 255, 255, 0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 14,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: GLASS.shadowColor,
    shadowOffset: GLASS.shadowOffset,
    shadowOpacity: GLASS.shadowOpacity,
    shadowRadius: GLASS.shadowRadius,
  },
  pressable: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginBottom: 8,
  },
  stationName: {
    flex: 1,
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  arrivalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 6,
  },
  lineBar: {
    width: 3,
    height: 16,
    borderRadius: 2,
  },
  arrLineName: {
    width: 72,
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
  },
  destPlatform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  arrDest: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    flexShrink: 1,
  },
  arrPlatform: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
  },
  arrTime: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
    minWidth: 48,
  },
  arrTimeDue: {
    color: DUE_GREEN,
  },
  loadingText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    paddingVertical: 4,
  },
  emptyText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    paddingVertical: 4,
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
