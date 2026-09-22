/**
 * DepartureCard.tsx
 * ─────────────────────────────────────────────────────────────────
 * Expanded departure card showing station header + up to 3 arrival rows.
 * Tap → calls onCardTap (opens StationDetailScreen via router push).
 * Long-press → triggers direct drag reordering.
 * ─────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useMemo, memo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useReduceTransparency } from '../hooks/useReduceTransparency';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { usePressAnimation } from '../hooks/usePressAnimation';
import { useLiveReducedMotion } from '../hooks/useReducedMotion';
import { GLASS } from '../theme/colors';
import { useStationArrivals } from '../services/stationArrivalsStore';
import { getVisibleArrivals } from '../selectors/stationLines';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { NORTHERN_SHADES } from '../constants/lineColors';
import { useShallow } from 'zustand/react/shallow';

// ─── Constants ────────────────────────────────────────────────────
const MAX_ROWS = 3;

function cleanDestinationName(dest: string | null | undefined): string {
  if (!dest) return 'Unknown';
  return dest
    .replace(
      /\s*(?:Underground Station|Elizabeth line Station|Overground Station|DLR Station|Rail Station|Station)$/i,
      ''
    )
    .trim();
}

function cleanPlatform(platform: string | null | undefined): string {
  if (!platform) return '';
  return String(platform)
    .replace(/\b(Northbound|Southbound|Eastbound|Westbound)\b\s*[-–—]?\s*/gi, '')
    .replace(/Platform\s*/i, 'P')
    .replace(/\s*via\s+[a-z0-9'\s]+/gi, '')
    .replace(/\s*-\s*$/g, '')
    .trim();
}

export interface DepartureCardProps {
  stationId: string;
  stationName: string;
  onLongPress?: () => void;
  onCardTap?: (stationId: string, stationName: string) => void;
  hideCard?: boolean;
  index?: number;
  isActive?: boolean;
  drag?: () => void;
  onDelete?: (stationId: string) => void;
  onMoveUp?: (index: number) => void;
  onMoveDown?: (index: number) => void;
  totalStations?: number;
}

// ─── Main component ──────────────────────────────────────────────
export const DepartureCard = memo(function DepartureCard({
  stationId,
  stationName,
  onLongPress,
  onCardTap,
  hideCard = false,
  isActive = false,
  drag,
}: DepartureCardProps) {
  const reducedMotion = useLiveReducedMotion();
  const reduceTransparency = useReduceTransparency();
  const { arrivals, loading } = useStationArrivals(stationId);

  const selectedLines = useUserPreferencesStore(useShallow(s => s.selectedLines || []));

  const pressAnim = usePressAnimation('departure_card', false, isActive);

  // ── Derived values ───────────────────────────────────────────
  const cleanName = String(stationName ?? '')
    .replace(
      /\s*(?:Underground Station|Elizabeth line Station|Overground Station|DLR Station|Rail Station|Station)$/i,
      ''
    )
    .trim();

  const visibleArrivals = useMemo(
    () => getVisibleArrivals(arrivals, selectedLines),
    [arrivals, selectedLines]
  );

  const displayArrivals = visibleArrivals.slice(0, MAX_ROWS);

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

  // ── Tap & Long Press handlers ──────────────────────────────────
  const handlePress = () => {
    pressAnim.onPress(() => {
      onCardTap?.(stationId, stationName);
    });
  };

  const handleBodyLongPress = () => {
    if (drag) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      drag();
    } else if (onLongPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      onLongPress();
    }
  };

  if (hideCard) return null;

  return (
    <Animated.View
      style={[styles.outerContainer, containerAnimStyle]}
      testID={`departure-card-${stationId}`}
    >
      <Animated.View
        style={[
          styles.innerGlass,
          pressAnim.animatedStyle,
          pressAnim.liftBorderStyle,
          reduceTransparency && { backgroundColor: '#1C1C1E' },
        ]}
      >
        {!reduceTransparency && (
          <BlurView
            intensity={GLASS.blurIntensity}
            tint={GLASS.blurTint}
            pointerEvents="none"
            style={StyleSheet.absoluteFillObject}
          />
        )}

        {/* Specular top highlight falloff across upper curved surface */}
        {!reduceTransparency && (
          <LinearGradient
            colors={[GLASS.specularStart, GLASS.specularEnd]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 18,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
            }}
            pointerEvents="none"
          />
        )}

        {/* Dedicated Apple Glass Border Overlay */}
        <Animated.View
          style={[styles.borderOverlay, pressAnim.liftBorderStyle]}
          pointerEvents="none"
        />

        <Pressable
          onPress={handlePress}
          pressRetentionOffset={{ top: 10, left: 10, right: 10, bottom: 10 }}
          unstable_pressDelay={80}
          delayLongPress={300}
          onLongPress={handleBodyLongPress}
          onPressIn={pressAnim.onPressIn}
          onPressOut={pressAnim.onPressOut}
          style={styles.pressable}
          testID={`departure-card-pressable-${stationId}`}
        >
          {/* Station header */}
          <View style={styles.headerRow}>
            <Text style={styles.stationName} numberOfLines={1} ellipsizeMode="tail">
              {cleanName}
            </Text>
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
                  <View
                    style={[
                      styles.lineBar,
                      { backgroundColor: arr.lineColor },
                      (arr.lineId === 'northern' || arr.lineColor === '#000000') && {
                        borderWidth: 0.5,
                        borderColor: NORTHERN_SHADES.highlightBorder,
                      },
                    ]}
                  />
                  <Text style={styles.arrLineName} numberOfLines={1}>
                    {arr.lineName}
                  </Text>
                  <View style={styles.destPlatform}>
                    <Text style={styles.arrDest} numberOfLines={1}>
                      {cleanDestinationName(arr.destination)}
                      {arr.via ? (
                        <Text style={styles.arrVia}> {arr.via}</Text>
                      ) : null}
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
});

DepartureCard.displayName = 'DepartureCard';
export default DepartureCard;

// ─── Styles ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  outerContainer: {
    borderRadius: 16,
    overflow: 'visible',
    position: 'relative',
  },
  innerGlass: {
    flex: 1,
    backgroundColor: GLASS.background,
    borderWidth: GLASS.borderWidth,
    borderColor: GLASS.borderColor,
    borderTopColor: GLASS.borderTop,
    borderBottomColor: GLASS.borderBottom,
    borderRadius: 16,
    overflow: 'hidden',
  },
  borderOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: GLASS.borderWidth,
    borderColor: GLASS.borderColor,
    borderTopColor: GLASS.borderTop,
    borderBottomColor: GLASS.borderBottom,
  },
  pressable: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
  },
  stationName: {
    fontSize: 16,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: 'rgba(255, 255, 255, 0.95)',
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 10,
  },
  loadingText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 13,
    fontFamily: 'SpaceGrotesk_500Medium',
    paddingVertical: 4,
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 13,
    fontFamily: 'SpaceGrotesk_400Regular',
    paddingVertical: 4,
  },
  arrivalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  lineBar: {
    width: 3,
    height: 14,
    borderRadius: 2,
    marginRight: 8,
  },
  arrLineName: {
    width: 80,
    fontSize: 12,
    fontFamily: 'SpaceGrotesk_600SemiBold',
    color: 'rgba(255, 255, 255, 0.85)',
    marginRight: 8,
  },
  destPlatform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  arrDest: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'SpaceGrotesk_500Medium',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  arrVia: {
    fontSize: 11,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255, 255, 255, 0.45)',
  },
  arrPlatform: {
    fontSize: 11,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255, 255, 255, 0.45)',
    marginLeft: 6,
  },
  arrTime: {
    fontSize: 13,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: 'rgba(255, 255, 255, 0.95)',
    minWidth: 44,
    textAlign: 'right',
  },
  arrTimeDue: {
    color: '#34C759',
  },
});
