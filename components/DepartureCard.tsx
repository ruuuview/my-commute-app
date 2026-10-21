/**
 * DepartureCard.tsx
 * ─────────────────────────────────────────────────────────────────
 * Expanded departure card showing station header + up to 3 arrival rows.
 * Shared WYSIWYG single source of truth across Onboarding & Dashboard.
 * Tap → calls onCardTap (opens StationDetailScreen or toggles onboarding).
 * Long-press → triggers direct drag reordering on Dashboard.
 * ─────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useMemo, memo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
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
import { useLiveReducedMotion } from '../hooks/useReducedMotion';
import { GLASS, DUE_TIME_STYLE } from '../theme/colors';
import { useStationArrivals } from '../services/stationArrivalsStore';
import { getVisibleArrivals } from '../selectors/stationLines';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { useOnboardingStore } from '../store/onboardingStore';
import { useLineDataStore } from '../store/lineDataStore';
import { NORTHERN_SHADES, LINE_IDENTITY_COLORS } from '../constants/lineColors';
import { LINE_SHORT_NAMES } from '../data/lineMetadata';
import { getPillColors } from '../utils/pillColors';
import { cleanDisplayStationName } from '../data/tflStations';
import { tflCapitalise } from '../utils/tflCapitalise';
import type { NormalizedDeparture } from '../services/apiService';

// ─── Constants ────────────────────────────────────────────────────
const MAX_ROWS = 3;
const NIGHT_TUBE_SET = new Set(['central', 'jubilee', 'northern', 'piccadilly', 'victoria']);

function getLondonTime(): { day: number; hours: number } {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      weekday: 'short',
      hour: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const weekdayStr = parts.find(p => p.type === 'weekday')?.value;
    const hourStr = parts.find(p => p.type === 'hour')?.value ?? '0';
    const hours = parseInt(hourStr, 10);
    const dayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const day = weekdayStr ? (dayMap[weekdayStr] ?? now.getDay()) : now.getDay();
    return { day, hours };
  } catch {
    const now = new Date();
    return { day: now.getDay(), hours: now.getHours() };
  }
}

function getStationNightTubeStatus(lineIds: string[]) {
  const hasNightTube = lineIds.some(id => NIGHT_TUBE_SET.has(id.toLowerCase()));
  if (!hasNightTube) return null;

  const { day, hours } = getLondonTime();

  if ((day === 6 || day === 0) && hours >= 0 && hours < 5) {
    return { label: '24h', active: true };
  }
  if ((day === 5 || day === 6) && hours >= 5) {
    return { label: '24h', active: false };
  }
  return null;
}

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
  lines?: string[];
  departures?: NormalizedDeparture[];
  rightElement?: React.ReactNode;
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
  disabled?: boolean;
}

// ─── Main component ──────────────────────────────────────────────
export const DepartureCard = memo(function DepartureCard({
  stationId,
  stationName,
  lines,
  departures,
  rightElement,
  onLongPress,
  onCardTap,
  hideCard = false,
  index = 0,
  isActive = false,
  drag,
  onMoveUp,
  onMoveDown,
  totalStations = 1,
  disabled = false,
}: DepartureCardProps) {
  const reducedMotion = useLiveReducedMotion();
  const reduceTransparency = useReduceTransparency();
  const { arrivals: storeArrivals, loading: storeLoading, error: storeError } = useStationArrivals(
    stationId,
    { enabled: !hideCard && departures === undefined }
  );

  const arrivals = departures !== undefined ? departures : storeArrivals;
  const loading = departures !== undefined ? false : storeLoading;
  const isError = departures !== undefined ? false : storeError;

  const selectedLinesFromPrefs = useUserPreferencesStore(s => s.selectedLines || []);
  const selectedLinesFromOnboarding = useOnboardingStore(s => s.selectedLines || []);
  const userSelectedLines = selectedLinesFromOnboarding.length > 0
    ? selectedLinesFromOnboarding
    : selectedLinesFromPrefs;

  const lineStoreLines = useLineDataStore(s => s.lines);

  const pressAnim = usePressAnimation('departure_card', disabled, isActive);

  // ── Derived values ───────────────────────────────────────────
  const cleanName = tflCapitalise(cleanDisplayStationName(String(stationName ?? '')));

  const visibleArrivals = useMemo(
    () => getVisibleArrivals(arrivals, userSelectedLines),
    [arrivals, userSelectedLines]
  );

  const stationLines = useMemo(() => {
    return (lines && lines.length > 0)
      ? lines
      : arrivals.map(a => a.lineId.toLowerCase());
  }, [lines, arrivals]);

  const nightTubeStatus = useMemo(() => {
    return getStationNightTubeStatus(stationLines);
  }, [stationLines]);

  const displayArrivals = visibleArrivals.slice(0, MAX_ROWS);

  // ── Empty state message resolution ────────────────────────────
  const emptyStateMessage = useMemo(() => {
    if (displayArrivals.length > 0 || loading) return null;

    const selectedServing = stationLines.filter(l => userSelectedLines.includes(l));
    const targetLines = selectedServing.length > 0 ? selectedServing : stationLines;

    // 1. All closed (code 20 or 'service closed')
    const allClosed = targetLines.length > 0 && targetLines.every(l => {
      const lineData = lineStoreLines[l];
      if (!lineData) return false;
      const s = (lineData.status || '').toLowerCase().trim();
      return lineData.status_severity === 20 || s === 'service closed';
    });

    if (allClosed) {
      return 'Service closed';
    }

    // 2. Official TfL Disruption Status (e.g. Planned Closure, Part Suspended, Suspended)
    const disruptedLine = targetLines.map(l => lineStoreLines[l]).find(ld => {
      if (!ld) return false;
      const s = (ld.status || '').toLowerCase().trim();
      return ld.status_severity !== 10 && ld.status_severity !== 20 && s !== 'good service' && s !== 'service closed';
    });

    if (disruptedLine) {
      return `${disruptedLine.name}: ${disruptedLine.status}`;
    }

    // 3. Network error with zero cache on cold start
    if (isError) {
      return 'Waiting for signal...';
    }

    // 4. Good service but 0 trains due
    return 'No trains due';
  }, [displayArrivals.length, loading, stationLines, userSelectedLines, lineStoreLines, isError]);

  // ── Line Pills ────────────────────────────────────────────────
  const renderLinePills = () => {
    if (!stationLines || stationLines.length === 0) return null;

    const sortedLines = [...stationLines].sort((a, b) => {
      const aSelected = userSelectedLines.includes(a);
      const bSelected = userSelectedLines.includes(b);
      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;
      return 0;
    });

    const maxVisible = sortedLines.length === 4 ? 4 : 3;
    const visibleLines = sortedLines.slice(0, maxVisible);
    const overflowCount = Math.max(0, sortedLines.length - maxVisible);

    return (
      <View style={styles.pillsContainer}>
        {visibleLines.map((lineId) => {
          const shortName = LINE_SHORT_NAMES[lineId] || lineId;
          const brandColor = LINE_IDENTITY_COLORS[lineId] || '#888';
          const colors = getPillColors(lineId, brandColor);

          return (
            <View
              key={lineId}
              style={[styles.pillItem, { borderColor: colors.borderColor }]}
              accessibilityLabel={`${shortName} line`}
              accessibilityRole="text"
            >
              <View style={[styles.pillColorLayer, { backgroundColor: colors.backgroundColor }]} />
              <View style={[styles.pillBar, { backgroundColor: colors.dotColor }]} />
              <Text style={[styles.pillText, { color: colors.textColor }]}>{shortName}</Text>
            </View>
          );
        })}
        {overflowCount > 0 && (
          <View style={styles.overflowBadge}>
            <Text style={styles.overflowText}>+{overflowCount}</Text>
          </View>
        )}
      </View>
    );
  };

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
    if (disabled) return;
    pressAnim.onPress(() => {
      onCardTap?.(stationId, stationName);
    });
  };

  const handleBodyLongPress = () => {
    if (disabled) return;
    if (drag) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
      drag();
    } else if (onLongPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
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
          disabled={disabled}
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
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
                AccessibilityInfo.announceForAccessibility(
                  `${cleanName} moved up to position ${index} of ${totalStations}`
                );
              }
            } else if (event.nativeEvent.actionName === 'decrement') {
              if (index < totalStations - 1) {
                onMoveDown?.(index);
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
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
            <Text
              style={styles.stationName}
              adjustsFontSizeToFit={true}
              minimumFontScale={0.75}
            >
              {cleanName}
            </Text>
            {renderLinePills()}
            <View style={styles.headerSpacer} />
            {rightElement ? (
              <View style={styles.rightContainer}>{rightElement}</View>
            ) : nightTubeStatus ? (
              <View style={styles.nightTubeCapsule}>
                <Text style={styles.nightTubeMoon}>🌙</Text>
                <Text style={styles.nightTubeCapsuleText}>{nightTubeStatus.label}</Text>
              </View>
            ) : null}
          </View>

          {/* Subtle glass divider to give definition to the station name */}
          <View style={styles.divider} />

          {/* Departure rows */}
          {loading ? (
            <Text style={styles.loadingText}>...</Text>
          ) : displayArrivals.length === 0 ? (
            <View style={styles.emptyContainer} testID="departure-card-empty">
              <Text style={styles.emptyText}>{emptyStateMessage}</Text>
            </View>
          ) : (
            <View testID="ledger-table">
              {displayArrivals.map((arr, idx) => {
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
                    <Text style={[styles.arrTime, isDue && styles.arrTimeDue, DUE_TIME_STYLE]} numberOfLines={1}>
                      {timeText}
                    </Text>
                  </View>
                );
              })}
            </View>
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
    marginBottom: 12,
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
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 22,
  },
  stationName: {
    fontSize: 14,
    fontFamily: 'SpaceGrotesk_700Bold',
    letterSpacing: -0.1,
    color: '#FFFFFF',
    flexShrink: 1,
    marginRight: 8,
  },
  headerSpacer: {
    flex: 1,
  },
  rightContainer: {
    flexShrink: 0,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  pillItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
    position: 'relative',
  },
  pillColorLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  pillBar: {
    width: 2,
    height: 8,
    borderRadius: 0.8,
  },
  pillText: {
    fontSize: 9,
    fontWeight: '600',
    fontFamily: 'SpaceGrotesk_600SemiBold',
  },
  overflowBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderRadius: 4,
    paddingHorizontal: 4,
    height: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overflowText: {
    fontSize: 8,
    color: 'rgba(255, 255, 255, 0.45)',
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  nightTubeCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 8,
    flexShrink: 0,
  },
  nightTubeMoon: {
    fontSize: 9,
    marginRight: 3,
  },
  nightTubeCapsuleText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 9.5,
    color: 'rgba(255, 255, 255, 0.85)',
    letterSpacing: 0.1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginTop: 7,
    marginBottom: 8,
  },
  loadingText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 13,
    fontFamily: 'SpaceGrotesk_500Medium',
    paddingVertical: 4,
  },
  emptyContainer: {
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 12.5,
    fontFamily: 'SpaceGrotesk_500Medium',
    textAlign: 'center',
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
    fontVariant: ['tabular-nums'],
    color: 'rgba(255, 255, 255, 0.95)',
    minWidth: 44,
    textAlign: 'right',
  },
  arrTimeDue: {
    color: '#34C759',
  },
});
