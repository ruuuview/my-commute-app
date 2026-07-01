import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  useReducedMotion,
} from 'react-native-reanimated';
import { usePressAnimation } from '../hooks/usePressAnimation';
import { tflCapitalise } from '../utils/tflCapitalise';
import { cleanDisplayStationName } from '../data/tflStations';
import { LINE_COLORS } from '../constants/lineColors';
import { LINE_SHORT_NAMES } from '../data/lineMetadata';
import { resolveTflStopIds } from '../utils/resolveTflStopId';
import { getPillColors } from '../utils/pillColors';
import { normaliseLineId } from '../utils/normaliseLineId';
import { APP_CONFIG } from '../config/app.config';
import { GLASS } from '../theme/colors';
import { GlassRim } from './GlassRim';

const cleanPlatformName = (platform: string): string => {
  if (!platform) return '';
  const match = platform.match(/Platform\s+[A-Za-z0-9]+/i);
  if (match) {
    return match[0].charAt(0).toUpperCase() + match[0].slice(1);
  }
  return platform;
};

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
  departures?: Departure[];
  mode: 'onboarding' | 'dashboard';
}

const LINE_TERMINALS: Record<string, string[]> = {
  northern: ['Morden', 'Edgware', 'Mill Hill East', 'High Barnet'],
  central: ['Epping', 'Hainault', 'Ruislip Gardens', 'West Ruislip'],
  elizabeth: ['Reading', 'Heathrow T5', 'Shenfield', 'Abbey Wood'],
  jubilee: ['Stanmore', 'Stratford'],
  victoria: ['Brixton', 'Walthamstow Central'],
  piccadilly: ['Cockfosters', 'Heathrow T5', 'Uxbridge'],
  district: ['Richmond', 'Wimbledon', 'Ealing Broadway', 'Upminster'],
  circle: ['Hammersmith', 'Edgware Road'],
  bakerloo: ['Harrow & Wealdstone', 'Elephant & Castle'],
  metropolitan: ['Aldgate', 'Watford', 'Amersham', 'Uxbridge'],
  'hammersmith-city': ['Hammersmith', 'Barking'],
  overground: ['Watford Junction', 'London Euston', 'Clapham Junction', 'Highbury & Islington', 'Stratford'],
  weaver: ['Chingford', 'Liverpool Street', 'Enfield Town', 'Cheshunt'],
  mildmay: ['Stratford', 'Richmond', 'Clapham Junction'],
  windrush: ['Highbury & Islington', 'West Croydon', 'Crystal Palace', 'New Cross', 'Clapham Junction'],
  suffragette: ['Gospel Oak', 'Barking Riverside'],
  lioness: ['Watford Junction', 'London Euston'],
  liberty: ['Romford', 'Upminster'],
  dlr: ['Bank', 'Lewisham', 'Beckton', 'Woolwich Arsenal'],
};

function getSeedOffset(stationId: string): number {
  let sum = 0;
  for (let i = 0; i < stationId.length; i++) {
    sum += stationId.charCodeAt(i);
  }
  return sum % 5;
}

function generateMockDepartures(stationId: string, lines: string[], count = 3): Departure[] {
  const linesList = lines.length > 0 ? lines : ['central'];
  const seed = getSeedOffset(stationId);
  const departures: Departure[] = [];

  const headwayMins: Record<string, number> = {
    dlr: 4,
    northern: 3,
    elizabeth: 5,
    overground: 6,
  };

  const lastMinsForLineDirection: Record<string, number> = {};
  const lineOccurrenceCount: Record<string, number> = {};

  let index = 0;
  while (departures.length < count && index < 15) {
    const lineId = linesList[index % linesList.length];
    const minHeadway = headwayMins[lineId] ?? 3;

    const lastVal = lastMinsForLineDirection[lineId];
    let mins = 0;
    if (lastVal === undefined) {
      mins = seed % 3;
    } else {
      mins = lastVal + minHeadway + ((seed + index) % 3);
    }

    lastMinsForLineDirection[lineId] = mins;

    const shortName = LINE_SHORT_NAMES[lineId] || lineId;
    const terminals = LINE_TERMINALS[lineId] || ['See timetable'];
    const occ = lineOccurrenceCount[lineId] ?? 0;
    lineOccurrenceCount[lineId] = occ + 1;
    const destination = terminals[(occ + seed) % terminals.length];

    const platformNum = ((seed + index) % 4) + 1;
    departures.push({
      lineId,
      lineColor: LINE_COLORS[lineId] || '#888',
      lineName: shortName,
      destination,
      timeText: `${mins} min`,
      isImminent: mins <= 2,
      platform: `Platform ${platformNum}`,
    });
    index++;
  }

  return departures.sort((a, b) => {
    const valA = parseInt(a.timeText) || 0;
    const valB = parseInt(b.timeText) || 0;
    return valA - valB;
  });
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
  mode,
}: StationCardProps) {
  const reducedMotion = useReducedMotion();
  const pressAnim = usePressAnimation('station_row', disabled);

  const cleanName = tflCapitalise(cleanDisplayStationName(station.name));

  const [liveDepartures, setLiveDepartures] = useState<Departure[] | null>(null);

  useEffect(() => {
    if (mode !== 'onboarding' || !showLedger || departures) return;

    let active = true;
    const fetchLive = async () => {
      try {
        const resolvedIds = resolveTflStopIds(station.id);
        const responses = await Promise.all(
          resolvedIds.map(id =>
            fetch(`${APP_CONFIG.BACKEND_URL}/api/stations/${id}`)
              .then(res => (res.ok ? res.json() : null))
              .catch(() => null)
          )
        );

        if (!active) return;

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
          if (dest.includes('DELETE') || dest.includes('⚠️')) return;
          // Deduplicate by line, destination, and minutes_away to prevent duplicate-looking rows
          const key = `${dep.line}-${dep.destination}-${dep.minutes_away ?? dep.expected_arrival}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            dedupedRaw.push(dep);
          }
        });

        dedupedRaw.sort((a, b) => (a.minutes_away || 0) - (b.minutes_away || 0));

        const mapped: Departure[] = dedupedRaw.map((dep: any) => {
          const { lineId, cleanLineId } = normaliseLineId(dep.line);
          return {
            lineId,
            lineColor: LINE_COLORS[cleanLineId] || '#888',
            lineName: LINE_SHORT_NAMES[cleanLineId] || dep.line,
            destination: String(dep.destination || '')
              .replace(' Underground Station', '')
              .replace(' DLR Station', ''),
            timeText: `${dep.minutes_away} min`,
            isImminent: dep.minutes_away <= 2,
            platform: dep.platform ? cleanPlatformName(dep.platform) : '',
          };
        });

        setLiveDepartures(mapped);
      } catch (e) {
        console.log('Error fetching live departures in onboarding card:', e);
      }
    };

    fetchLive();
    return () => { active = false; };
  }, [station.id, showLedger, departures, mode]);

  const displayDepartures = useMemo(() => {
    const shouldShow = showLedger || mode === 'dashboard';
    if (!shouldShow) return [];
    const hasLive = liveDepartures && liveDepartures.length > 0;
    const resolved = departures ?? (hasLive ? liveDepartures : null) ?? generateMockDepartures(station.id, station.lines, 3);
    return resolved.slice(0, 3);
  }, [station.id, station.lines, showLedger, departures, mode, liveDepartures]);



  const renderLinePills = () => {
    if (!station.lines || station.lines.length === 0) return null;
    const visibleLines = station.lines.slice(0, 4);
    const overflowCount = station.lines.length - 4;

    return (
      <View style={styles.pillsRowWrapper}>
        <View style={styles.pillsContainer}>
          {visibleLines.map((lineId) => {
            const shortName = LINE_SHORT_NAMES[lineId] || lineId;
            const brandColor = LINE_COLORS[lineId] || '#888';
            const colors = getPillColors(lineId, brandColor);

            return (
              <View
                key={lineId}
                style={[styles.pillItem, { borderColor: colors.borderColor }]}
                accessibilityLabel={`${shortName} line`}
                accessibilityRole="text"
              >
                <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFillObject} />
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
      </View>
    );
  };

  const hasLedger = displayDepartures.length > 0;
  const isDashboardMode = mode === 'dashboard';

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onPressIn={pressAnim.onPressIn}
      onPressOut={pressAnim.onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${cleanName}, ${selected ? 'selected' : 'unselected'}`}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.outerCard,
        pressed && styles.outerCardPressed,
      ]}
    >
      <GlassRim borderRadius={16}>
        <Animated.View style={[styles.cardInner, !reducedMotion && pressAnim.animatedStyle]}>
          {/* Dark smoked glass background */}
          <BlurView
            intensity={GLASS.blurIntensity}
            tint="dark"
            style={[StyleSheet.absoluteFillObject, styles.blurBackground]}
          />

        <View style={styles.cardContent}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.stationName} numberOfLines={1} ellipsizeMode="tail">
              {cleanName}
            </Text>
            {!isDashboardMode && rightElement && (
              <View style={styles.rightContainer}>{rightElement}</View>
            )}
          </View>

          {renderLinePills()}

          {hasLedger && (
            <>
              <View style={styles.divider} />
              <View style={styles.ledgerTable}>
                {displayDepartures.map((dep, idx) => {
                  const minutesVal = parseInt(dep.timeText) || 0;
                  const depStyle = getDepTimeStyle(minutesVal);

                  return (
                    <View key={idx} style={styles.ledgerRow}>
                      <View style={styles.columnIdentity}>
                        <View style={[styles.ledgerBar, { backgroundColor: dep.lineColor }]} />
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
            </>
          )}
        </View>
      </Animated.View>
      </GlassRim>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outerCard: {
    marginBottom: 14,
    borderRadius: 16,
    shadowColor: GLASS.shadowColor,
    shadowOffset: GLASS.shadowOffset,
    shadowOpacity: GLASS.shadowOpacity,
    shadowRadius: GLASS.shadowRadius,
  },
  outerCardPressed: {
    opacity: 0.65,
  },
  cardInner: {
    flex: 1,
    overflow: 'hidden',
  },
  blurBackground: {
    backgroundColor: Platform.OS === 'android' ? 'rgba(30, 30, 40, 0.9)' : GLASS.background,
  },
  cardContent: {
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  stationName: {
    fontSize: 13,
    fontFamily: 'SpaceGrotesk_600SemiBold',
    color: 'rgba(255, 255, 255, 0.95)',
    flex: 1,
    marginBottom: 4,
  },
  rightContainer: {
    flexShrink: 0,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillsRowWrapper: {
    marginTop: 0,
    marginBottom: 2,
  },
  pillsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pillItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 20,
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  pillColorLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  pillBar: {
    width: 2.5,
    height: 10,
    borderRadius: 1,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'SpaceGrotesk_600SemiBold',
  },
  overflowBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderRadius: 4,
    paddingHorizontal: 5,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overflowText: {
    fontSize: 9,
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
});
