import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LiquidGlassView } from './LiquidGlassView';
import Animated, {
  useReducedMotion,
} from 'react-native-reanimated';
import { usePressAnimation } from '../hooks/usePressAnimation';
import { tflCapitalise } from '../utils/tflCapitalise';
import { cleanDisplayStationName } from '../data/tflStations';
import { LINE_SHORT_NAMES } from '../data/lineMetadata';
import { getPillColors } from '../utils/pillColors';
import { fetchNormalizedStationArrivals } from '../services/apiService';
import { LINE_IDENTITY_COLORS, NORTHERN_SHADES } from '../constants/lineColors';
import { getVisibleArrivals } from '../selectors/stationLines';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { useOnboardingStore } from '../store/onboardingStore';
import { useLineDataStore } from '../store/lineDataStore';

export interface Departure {
  lineId: string;
  lineColor: string;
  lineName: string;
  destination: string;
  timeText: string;
  isImminent: boolean;
  platform?: string;
}

interface StationCardProps {
  station: {
    id: string;
    name: string;
    lines: string[];
    zone?: number;
  };
  rightElement?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  selected?: boolean;
  showLedger?: boolean;
  departures?: Departure[] | null;
  fetchError?: boolean;
  mode: 'onboarding' | 'dashboard';
}

const getDepTimeStyle = (minutes: number) => {
  if (minutes === 0) {
    return { color: '#30D158', fontFamily: 'SpaceGrotesk_700Bold', fontWeight: '700' as const };
  }
  if (minutes <= 2) {
    return { color: 'rgba(255,255,255,0.85)', fontWeight: '500' as const };
  }
  return { color: 'rgba(255,255,255,0.55)', fontWeight: '500' as const };
};

export function StationCard({
  station,
  rightElement,
  onPress,
  disabled = false,
  selected = false,
  showLedger = false,
  departures,
  fetchError = false,
  mode,
}: StationCardProps) {
  const reducedMotion = useReducedMotion();
  const pressAnim = usePressAnimation('station_row', disabled);

  const cleanName = tflCapitalise(cleanDisplayStationName(station.name));

  const [liveDepartures, setLiveDepartures] = useState<Departure[] | null>(null);
  const [fetchStatus, setFetchStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const lineStoreLines = useLineDataStore(s => s.lines);

  const selectedLinesFromPrefs = useUserPreferencesStore(s => s.selectedLines);
  const selectedLinesFromOnboarding = useOnboardingStore(s => s.selectedLines);
  const userSelectedLines = mode === 'onboarding'
    ? (selectedLinesFromOnboarding.length > 0 ? selectedLinesFromOnboarding : selectedLinesFromPrefs)
    : (selectedLinesFromPrefs.length > 0 ? selectedLinesFromPrefs : selectedLinesFromOnboarding);

  useEffect(() => {
    if (!showLedger || departures !== undefined) return;

    let active = true;
    const fetchLive = async () => {
      setFetchStatus('loading');
      try {
        const data = await fetchNormalizedStationArrivals(station.id);
        if (!active) return;

        // Route raw arrivals through the single-source line selector
        // (AGENTS.md §0) — the ledger shows only the user's selected lines.
        const visible = getVisibleArrivals(data.departures, userSelectedLines);

        const mapped: Departure[] = visible.map(d => ({
          lineId: d.lineId,
          lineColor: d.lineColor,
          lineName: LINE_SHORT_NAMES[d.lineId] || d.lineName,
          destination: d.destination,
          timeText: d.minutesAway <= 0 ? 'Due' : `${d.minutesAway} min`,
          isImminent: d.minutesAway <= 2,
          platform: d.platform,
        }));

        setLiveDepartures(mapped);
        setFetchStatus('success');
      } catch {
        if (!active) return;
        setFetchStatus('error');
      }
    };

    fetchLive();
    return () => { active = false; };
  }, [station.id, showLedger, departures, userSelectedLines]);

  const displayDepartures = useMemo(() => {
    const shouldShow = showLedger || mode === 'dashboard';
    if (!shouldShow) return [];
    const resolved = (departures && departures.length > 0) ? departures : (liveDepartures ?? []);
    return resolved.slice(0, 3);
  }, [showLedger, mode, departures, liveDepartures]);

  const emptyStateMessage = useMemo(() => {
    if (displayDepartures.length > 0) return null;
    const shouldShow = showLedger || mode === 'dashboard';
    if (!shouldShow) return null;

    const effectiveStatus = fetchError || departures === null
      ? 'error'
      : (departures !== undefined ? 'success' : fetchStatus);

    if (effectiveStatus === 'error') {
      return "Couldn't load arrivals";
    }

    if (effectiveStatus === 'loading') {
      return "Loading arrivals...";
    }

    // Check if serving lines are closed (strictly code 20 or "Service Closed")
    const selectedServing = station.lines.filter(l => userSelectedLines.includes(l));
    const targetLines = selectedServing.length > 0 ? selectedServing : station.lines;

    const allClosed = targetLines.length > 0 && targetLines.every(l => {
      const lineData = lineStoreLines[l];
      if (!lineData) return false;
      const s = (lineData.status || '').toLowerCase().trim();
      return lineData.status_severity === 20 || s === 'service closed';
    });

    if (allClosed) {
      return "Service closed";
    }

    if (effectiveStatus === 'success') {
      return "No trains due";
    }

    return null;
  }, [displayDepartures.length, showLedger, mode, departures, fetchError, fetchStatus, station.lines, userSelectedLines, lineStoreLines]);



  const renderLinePills = () => {
    if (!station.lines || station.lines.length === 0) return null;

    const sortedLines = [...station.lines].sort((a, b) => {
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

  const isDashboardMode = mode === 'dashboard';
  const showLedgerSection = showLedger || isDashboardMode;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onPressIn={pressAnim.onPressIn}
      onPressOut={pressAnim.onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${cleanName}, served lines: ${station.lines.join(', ')}, ${selected ? 'selected' : 'unselected'}`}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.outerCard,
        pressed && styles.outerCardPressed,
      ]}
    >
      <Animated.View style={!reducedMotion ? pressAnim.animatedStyle : undefined}>
        <LiquidGlassView
          borderRadius={16}
          style={styles.cardContainer}
          contentStyle={styles.cardInner}
        >
          <View style={styles.cardContent}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.stationName} numberOfLines={1} ellipsizeMode="tail">
              {cleanName}
            </Text>
            {renderLinePills()}
            <View style={styles.headerSpacer} />
            {!isDashboardMode && rightElement && (
              <View style={styles.rightContainer}>{rightElement}</View>
            )}
          </View>

          {showLedgerSection && (
            <>
              <View style={styles.divider} />
              {displayDepartures.length > 0 ? (
                <View style={styles.ledgerTable} testID="ledger-table">
                  {displayDepartures.map((dep, idx) => {
                    const minutesVal = parseInt(dep.timeText) || 0;
                    const depStyle = getDepTimeStyle(minutesVal);

                    return (
                      <View key={idx} style={styles.ledgerRow}>
                        <View style={styles.columnIdentity}>
                          <View
                            style={[
                              styles.ledgerBar,
                              { backgroundColor: dep.lineColor },
                              (dep.lineId === 'northern' || dep.lineColor === '#000000') && {
                                borderWidth: 0.5,
                                borderColor: NORTHERN_SHADES.highlightBorder,
                              },
                            ]}
                          />
                          <Text style={styles.ledgerLineText} numberOfLines={1}>{dep.lineName}</Text>
                        </View>
                        <View style={styles.columnDestination}>
                          <Text style={styles.ledgerDestText} numberOfLines={1} ellipsizeMode="tail">
                            {dep.destination}
                          </Text>
                          {dep.platform ? (
                            <Text style={styles.ledgerPlatformText} numberOfLines={1}>
                              {dep.platform}
                            </Text>
                          ) : null}
                        </View>
                        <View style={styles.columnCountdown}>
                          <Text style={[styles.ledgerTimeText, depStyle]} numberOfLines={1}>
                            {minutesVal === 0 ? 'Due' : `${minutesVal} min`}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : emptyStateMessage ? (
                <View style={styles.emptyLedgerContainer}>
                  <Text style={styles.emptyLedgerText}>{emptyStateMessage}</Text>
                </View>
              ) : null}
            </>
          )}
          </View>
        </LiquidGlassView>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outerCard: {
    marginBottom: 14,
    borderRadius: 16,
    overflow: 'visible',
  },
  outerCardPressed: {
    opacity: 0.75,
  },
  cardContainer: {
    flex: 1,
  },
  cardInner: {
    minHeight: 74,
  },
  cardContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  stationName: {
    fontSize: 14,
    fontFamily: 'SpaceGrotesk_600SemiBold',
    color: 'rgba(255, 255, 255, 0.95)',
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
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    marginTop: 4,
    marginBottom: 5,
  },
  ledgerTable: {
    gap: 0,
  },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  columnIdentity: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  ledgerBar: {
    width: 3,
    height: 12,
    borderRadius: 1.5,
    marginRight: 6,
  },
  ledgerLineText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.4)',
    fontFamily: 'SpaceGrotesk_500Medium',
  },
  columnDestination: {
    flex: 3,
    paddingLeft: 4,
    flexDirection: 'column',
    justifyContent: 'center',
  },
  ledgerDestText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.65)',
    fontFamily: 'SpaceGrotesk_500Medium',
    lineHeight: 14,
  },
  ledgerPlatformText: {
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.35)',
    fontFamily: 'SpaceGrotesk_400Regular',
    marginTop: 1,
    lineHeight: 11,
  },
  columnCountdown: {
    width: 38,
    alignItems: 'flex-end',
  },
  ledgerTimeText: {
    fontSize: 12,
    fontFamily: 'SpaceGrotesk_700Bold',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  emptyLedgerContainer: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyLedgerText: {
    fontSize: 12,
    fontFamily: 'SpaceGrotesk_500Medium',
    color: 'rgba(255, 255, 255, 0.45)',
  },
});
