import React, { useEffect, useMemo, memo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Platform,
  AccessibilityInfo,
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
import { useLiveReducedMotion } from '../hooks/useJiggle';
import { GLASS, DUE_TIME_STYLE } from '../theme/colors';
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
const DepartureCard = memo(function DepartureCard({
  stationId,
  stationName,
  onLongPress,
  onCardTap,
  hideCard = false,
  index = 0,
  isActive = false,
  drag,
  onDelete,
  onMoveUp,
  onMoveDown,
  totalStations = 1,
}: DepartureCardProps) {
  const reducedMotion = useLiveReducedMotion();
  const reduceTransparency = useReduceTransparency();
  const { arrivals, loading } = useStationArrivals(stationId, { enabled: true });

  const selectedLines = useUserPreferencesStore(useShallow(s => s.selectedLines || []));

  const pressAnim = usePressAnimation('departure_card', false, isActive);

  // ── Derived values ───────────────────────────────────────────
  const cleanName = String(stationName ?? '')
    .replace(
      /\s*(?:Underground Station|Elizabeth line Station|Overground Station|DLR Station|Rail Station|Station)$/i,
      ''
    )
    .trim();

  // Route raw arrivals through the single-source line selector (AGENTS.md §0):
  // the card shows only the user's selected lines, re-filtered live on change.
  const visibleArrivals = useMemo(
    () => getVisibleArrivals(arrivals, selectedLines),
    [arrivals, selectedLines]
  );

  const displayArrivals = visibleArrivals.slice(0, MAX_ROWS);

  // ── Search-collapse animation (hideCard prop) ─────────────────
  const collapseOpacity = useSharedValue(hideCard ? 0 : 1);
  const collapseMargin = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      collapseOpacity.value = hideCard ? 0 : 1;
      collapseMargin.value = 0;
    } else {
      collapseOpacity.value = withTiming(hideCard ? 0 : 1, { duration: 150 });
      collapseMargin.value = withSpring(0, { damping: 22, stiffness: 240 });
    }
  }, [hideCard, reducedMotion, collapseOpacity, collapseMargin]);

  const containerAnimStyle = useAnimatedStyle(() => ({
    opacity: collapseOpacity.value,
    marginBottom: collapseMargin.value,
  }));

  // ── Tap & Long-Press handlers ─────────────────────────────────
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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onLongPress();
    }
  };

  if (hideCard) return null;

  return (
    <Animated.View
      style={[styles.outerContainer, containerAnimStyle]}
      testID={`departure-card-${stationId}`}
    >
      <Animated.View style={[styles.innerGlass, pressAnim.animatedStyle, pressAnim.liftBorderStyle, reduceTransparency && { backgroundColor: '#1C1C1E' }]}>
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

        {/* Specular bottom catch-light sheen across lower curved surface */}
        {!reduceTransparency && (
          <LinearGradient
            colors={[GLASS.specularEnd, GLASS.specularStart]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 12,
              borderBottomLeftRadius: 16,
              borderBottomRightRadius: 16,
            }}
            pointerEvents="none"
          />
        )}

        {/* Dedicated Apple Glass Border Overlay (guaranteed on top of BlurView & wash) */}
        <Animated.View
          style={[styles.borderOverlay, pressAnim.liftBorderStyle]}
          pointerEvents="none"
        />

        <Pressable
          onPress={handlePress}
          pressRetentionOffset={{ top: 10, left: 10, right: 10, bottom: 10 }}
          unstable_pressDelay={80}
          delayLongPress={220}
          onLongPress={handleBodyLongPress}
          onPressIn={() => pressAnim.onPressIn()}
          onPressOut={() => pressAnim.onPressOut()}
          accessibilityRole="adjustable"
          accessibilityLabel={`Station ${cleanName}`}
          accessibilityHint="Long-press and drag to reorder, or swipe left to delete"
          accessibilityValue={{ text: `Position ${index + 1} of ${totalStations}` }}
          accessibilityActions={[
            { name: 'increment', label: 'Move Up' },
            { name: 'decrement', label: 'Move Down' },
          ]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'increment') {
              if (index > 0) {
                onMoveUp?.(index);
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                AccessibilityInfo.announceForAccessibility(
                  `${cleanName} moved up to position ${index} of ${totalStations}`
                );
              }
            } else if (event.nativeEvent.actionName === 'decrement') {
              if (index < totalStations - 1) {
                onMoveDown?.(index);
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                AccessibilityInfo.announceForAccessibility(
                  `${cleanName} moved down to position ${index + 2} of ${totalStations}`
                );
              }
            }
          }}
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
    width: '100%',
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
  arrVia: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.45)',
  },
  arrTime: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.65)',
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
    minWidth: 48,
  },
  arrTimeDue: {
    ...DUE_TIME_STYLE,
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
});

