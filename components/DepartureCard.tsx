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
 * ─────────────────────────────────────────────────────────────────
 */

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
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useReduceTransparency } from '../hooks/useReduceTransparency';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  SharedValue,
  FadeIn,
  FadeOut,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';
import { usePressAnimation } from '../hooks/usePressAnimation';
import { useJiggle, JiggleDriver, useLiveReducedMotion } from '../hooks/useJiggle';
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
  jiggle?: JiggleDriver;
  globalJiggle?: SharedValue<number>;
  isEditing?: boolean;
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
  jiggle,
  isEditing = false,
  drag,
  onDelete,
  onMoveUp,
  onMoveDown,
  totalStations = 1,
}: DepartureCardProps) {
  const reducedMotion = useLiveReducedMotion();
  const reduceTransparency = useReduceTransparency();
  // Pause interval polling during edit mode so updates don't shift layout mid-drag
  const { arrivals, loading } = useStationArrivals(stationId, { enabled: !isEditing });

  const selectedLines = useUserPreferencesStore(useShallow(s => s.selectedLines || []));

  const pressAnim = usePressAnimation('departure_card', false, isActive);
  const deletePressAnim = usePressAnimation('line_deselect', false);
  // Seed jiggle by stationId so phase stays stable across list reorder
  const jiggleStyle = useJiggle(jiggle, stationId || index, isActive);

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
    if (isEditing) return; // Inactive in edit mode
    pressAnim.onPress(() => {
      onCardTap?.(stationId, stationName);
    });
  };

  const handleBodyLongPress = () => {
    if (isEditing) return; // Body never drags — grabber owns drag
    if (onLongPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      onLongPress();
    }
  };

  if (hideCard) return null;

  return (
    <Animated.View
      style={[styles.outerContainer, containerAnimStyle, jiggleStyle]}
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

        {/* Dedicated Apple Glass Border Overlay (guaranteed on top of BlurView & wash) */}
        <Animated.View
          style={[styles.borderOverlay, pressAnim.liftBorderStyle]}
          pointerEvents="none"
        />


        <Pressable
          onPress={isEditing ? undefined : handlePress}
          pressRetentionOffset={{ top: 10, left: 10, right: 10, bottom: 10 }}
          unstable_pressDelay={80}
          delayLongPress={700}
          onLongPress={isEditing ? undefined : handleBodyLongPress}
          onPressIn={() => {
            if (!isEditing) {
              pressAnim.onPressIn();
            }
          }}
          onPressOut={() => {
            if (!isEditing) {
              pressAnim.onPressOut();
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

            {/* Dedicated reorder grabber in edit mode */}
            {isEditing && drag && (
              <Animated.View
                entering={FadeIn.duration(150)}
                exiting={FadeOut.duration(100)}
                style={styles.grabberContainer}
              >
                <Pressable
                  onLongPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                    drag();
                  }}
                  delayLongPress={150}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="adjustable"
                  accessibilityLabel={`Reorder ${cleanName}`}
                  accessibilityHint="Swipe up or down to reorder this station"
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
                  style={styles.grabberButton}
                  testID={`departure-card-grabber-${stationId}`}
                >
                  <Ionicons name="reorder-three-outline" size={22} color="rgba(255, 255, 255, 0.45)" />
                </Pressable>
              </Animated.View>
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

      {/* iOS-Style Delete Badge matching LineCard exactly */}
      {isEditing && onDelete && (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(100)}
          style={styles.deleteBadgeContainer}
        >
          <Animated.View entering={ZoomIn.duration(200).springify()} exiting={ZoomOut.duration(100)}>
            <Animated.View style={deletePressAnim.animatedStyle}>
              <Pressable
                style={styles.deleteBadge}
                hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
                onPressIn={deletePressAnim.onPressIn}
                onPressOut={deletePressAnim.onPressOut}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
                  onDelete(stationId);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${cleanName}`}
                accessibilityHint={`Removes ${cleanName} from your pinned commute stations`}
                testID={`departure-card-delete-${stationId}`}
              >
                <Text style={styles.deleteIcon}>−</Text>
              </Pressable>
            </Animated.View>
          </Animated.View>
        </Animated.View>
      )}
    </Animated.View>
  );
});

DepartureCard.displayName = 'DepartureCard';
export default DepartureCard;

// ─── Styles ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  outerContainer: {
    marginBottom: 12,
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
  grabberContainer: {
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grabberButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  deleteBadgeContainer: {
    position: 'absolute',
    top: -7,
    left: -7,
    zIndex: 9999,
  },
  deleteBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  deleteIcon: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 18,
    textAlign: 'center',
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
