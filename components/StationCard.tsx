import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { usePressAnimation } from '../hooks/usePressAnimation';
import { tflCapitalise } from '../utils/tflCapitalise';
import { cleanDisplayStationName } from '../data/tflStations';
import { LINE_COLORS } from '../constants/lineColors';
import { LINE_SHORT_NAMES } from '../data/lineMetadata';
import { resolveTflStopId } from '../utils/resolveTflStopId';
import { IMMINENT_BLUE } from '../theme/colors';

export interface Departure {
  lineId: string;
  lineColor: string;
  lineName: string;
  destination: string;
  timeText: string;
  isImminent: boolean;
}

interface StationCardProps {
  station: {
    id: string;
    name: string;
    lines: string[];
    zone?: number;
  };
  primaryLineColor: string;
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

function getPillColors(lineId: string, brandColor: string) {
  // Dark/low-contrast lines — resolve readable variants
  if (lineId === 'northern') {
    return {
      borderColor: 'rgba(255,255,255,0.25)',
      backgroundColor: 'rgba(255,255,255,0.08)',
      dotColor: '#FFFFFF',
      textColor: 'rgba(255,255,255,0.80)',
    };
  }
  if (lineId === 'piccadilly') {
    return {
      borderColor: '#60A5FA66',
      backgroundColor: '#60A5FA1A',
      dotColor: '#003688',
      textColor: '#60A5FA',
    };
  }
  if (lineId === 'bakerloo') {
    return {
      borderColor: '#F59E0B66',
      backgroundColor: '#F59E0B1A',
      dotColor: '#B36305',
      textColor: '#F59E0B',
    };
  }
  if (lineId === 'jubilee') {
    return {
      borderColor: '#C8CDD166',
      backgroundColor: '#C8CDD11A',
      dotColor: '#868F98',
      textColor: '#FFFFFF',
    };
  }
  if (lineId === 'circle') {
    return {
      borderColor: '#FFD30066',
      backgroundColor: '#FFD3001A',
      dotColor: '#FFD300',
      textColor: '#FFFFFF',
    };
  }
  if (lineId === 'hammersmith-city') {
    return {
      borderColor: '#F3A9BB66',
      backgroundColor: '#F3A9BB1A',
      dotColor: '#F3A9BB',
      textColor: '#FFFFFF',
    };
  }
  // All other lines — brand color direct
  return {
    borderColor: `${brandColor}66`,
    backgroundColor: `${brandColor}1A`,
    dotColor: brandColor,
    textColor: brandColor,
  };
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

    departures.push({
      lineId,
      lineColor: LINE_COLORS[lineId] || '#888',
      lineName: shortName,
      destination,
      timeText: `${mins} min`,
      isImminent: mins <= 2,
    });
    index++;
  }

  return departures.sort((a, b) => {
    const valA = parseInt(a.timeText) || 0;
    const valB = parseInt(b.timeText) || 0;
    return valA - valB;
  });
}

function ImminentCountdown({ text, color }: { text: string; color: string }) {
  const opacity = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  React.useEffect(() => {
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
        styles.ledgerTimeText,
        { color },
        animatedStyle,
      ]}
      numberOfLines={1}
    >
      {text}
    </Animated.Text>
  );
}

export function StationCard({
  station,
  primaryLineColor,
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
        const resolvedId = resolveTflStopId(station.id);
        const res = await fetch(`https://my-commute-backend.vercel.app/api/stations/${resolvedId}`);
        if (!res.ok) return;
        const sData = await res.json();
        if (!active) return;

        const mapped: Departure[] = (sData.departures || []).map((dep: any) => {
          const rawLineId = String(dep.line || '').toLowerCase().replace(' line', '').trim();
          const cleanLineId = rawLineId.replace(/\s*&\s*/g, '-').replace(/\s+/g, '-');
          return {
            lineId: rawLineId,
            lineColor: LINE_COLORS[cleanLineId] || '#888',
            lineName: LINE_SHORT_NAMES[cleanLineId] || dep.line,
            destination: String(dep.destination || '').replace(' Underground Station', '').replace(' DLR Station', ''),
            timeText: `${dep.minutes_away} min`,
            isImminent: dep.minutes_away <= 2,
          };
        });

        setLiveDepartures(mapped);
      } catch (e) {
        console.log('Error fetching live departures in onboarding card:', e);
      }
    };

    fetchLive();

    return () => {
      active = false;
    };
  }, [station.id, showLedger, departures, mode]);

  const displayDepartures = useMemo(() => {
    const isDashboardMode = mode === 'dashboard';
    const shouldShow = showLedger || isDashboardMode;
    if (!shouldShow) return [];
    return (departures ?? liveDepartures ?? generateMockDepartures(station.id, station.lines, 3)).slice(0, 3);
  }, [station.id, station.lines, showLedger, departures, mode, liveDepartures]);

  const isNorthern = primaryLineColor === LINE_COLORS.northern;

  const activeBorderColor = useMemo(() => {
    if (mode === 'onboarding' && selected) {
      // Northern line is near-black (#1A1A1A) — use white fallback
      return isNorthern ? 'rgba(255, 255, 255, 0.55)' : `${primaryLineColor}66`;
    }
    return 'rgba(255, 255, 255, 0.13)';
  }, [mode, selected, primaryLineColor, isNorthern]);

  const selectedGlowStyle = useMemo(() => {
    if (mode !== 'onboarding' || !selected) return null;
    return {
      shadowColor: isNorthern ? 'rgba(255,255,255,0.4)' : primaryLineColor,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: isNorthern ? 0.9 : 0.45,
      shadowRadius: isNorthern ? 12 : 8,
      elevation: 4,
    };
  }, [mode, selected, primaryLineColor, isNorthern]);

  const handlePress = () => {
    if (disabled) return;
    onPress?.();
  };

  const getDepTimeColor = (minutes: number) => {
    if (minutes <= 9) {
      return 'rgba(255,255,255,0.90)';
    }
    return 'rgba(255,255,255,0.45)';
  };

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
                <View style={[styles.pillDot, { backgroundColor: colors.dotColor }]} />
                <Text style={[styles.pillText, { color: colors.textColor }]}>
                  {shortName}
                </Text>
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

  const isDashboardMode = mode === 'dashboard';
  const hasLedger = displayDepartures.length > 0;

  return (
    <Pressable 
      onPress={handlePress} 
      onPressIn={pressAnim.onPressIn}
      onPressOut={pressAnim.onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${cleanName}, ${selected ? 'selected' : 'unselected'}`}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.outerCard,
        { borderColor: activeBorderColor },
        selectedGlowStyle,
        pressed && styles.outerCardPressed,
      ]}
    >
      <Animated.View
        style={[
          styles.cardInner,
          !reducedMotion && pressAnim.animatedStyle,
        ]}
      >
        {/* Frosted glass background layer with Android fallback */}
        <BlurView
          intensity={30}
          tint="dark"
          style={[StyleSheet.absoluteFillObject, styles.blurBackground]}
        />

        {/* Brand color tint overlay for selected state (Apple pill design) */}
        {mode === 'onboarding' && selected && (
          <View style={[StyleSheet.absoluteFillObject, {
            backgroundColor: isNorthern ? 'rgba(255,255,255,0.08)' : `${primaryLineColor}1A`,
          }]} />
        )}

        {/* Content Area */}
        <View style={styles.cardContent}>
          {/* Header Row */}
          <View style={styles.cardHeaderRow}>
            <Text style={styles.stationName} numberOfLines={1} ellipsizeMode="tail">
              {cleanName}
            </Text>
            
            {/* Right Element (Onboarding selection controls or widgets) */}
            {!isDashboardMode && rightElement && (
              <View style={styles.rightContainer}>
                {rightElement}
              </View>
            )}
          </View>

          {/* Line Pills Row */}
          {renderLinePills()}

          {/* Departure divider and rows */}
          {hasLedger && (
            <>
              <View style={styles.divider} />
              <View style={styles.ledgerTable}>
                {displayDepartures.map((dep, idx) => {
                  const minutesVal = parseInt(dep.timeText) || 0;
                  const isImminent = minutesVal <= 2;
                  const timeColor = isImminent ? IMMINENT_BLUE : getDepTimeColor(minutesVal);

                  return (
                    <View key={idx} style={styles.ledgerRow}>
                      {/* Column 1: Identity (flex: 2) */}
                      <View style={styles.columnIdentity}>
                        <View style={[styles.ledgerDot, { backgroundColor: dep.lineColor }]} />
                        <Text style={styles.ledgerLineText} numberOfLines={1}>
                          {dep.lineName}
                        </Text>
                      </View>

                      {/* Column 2: Destination (flex: 3) */}
                      <View style={styles.columnDestination}>
                        <Text style={styles.ledgerDestText} numberOfLines={1} ellipsizeMode="tail">
                          {dep.destination}
                        </Text>
                      </View>

                      {/* Column 3: Countdown (flex: 0, fixed width: 38) */}
                      <View style={styles.columnCountdown}>
                        {isImminent ? (
                          <ImminentCountdown
                            text={minutesVal === 0 ? 'Due' : `${minutesVal} min`}
                            color={timeColor}
                          />
                        ) : (
                          <Text 
                            style={[
                              styles.ledgerTimeText, 
                              { color: timeColor }
                            ]} 
                            numberOfLines={1}
                          >
                            {minutesVal === 0 ? 'Due' : `${minutesVal} min`}
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outerCard: {
    alignSelf: 'stretch',
    borderRadius: 18,
    marginBottom: 6,
    borderWidth: 1,
    // minHeight: 56 applies only to no-ledger (collapsed) state.
    // Cards with departures naturally expand to ~118px.
    minHeight: 56,
    position: 'relative',
    // NOTE: overflow: 'hidden' removed here so iOS shadow (glow) renders.
    // cardInner has its own overflow: 'hidden' + borderRadius to clip blur/tint.
  },
  outerCardPressed: {
    opacity: 0.65,
  },
  cardInner: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  blurBackground: {
    backgroundColor: Platform.OS === 'android' ? 'rgba(15, 20, 70, 0.85)' : 'rgba(255, 255, 255, 0.07)',
  },
  cardContent: {
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  stationName: {
    fontSize: 14,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: 'rgba(255, 255, 255, 0.95)',
    flex: 1,
  },
  rightContainer: {
    flexShrink: 0,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillsRowWrapper: {
    marginTop: 2,
    marginBottom: 4,
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
  pillDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
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
    marginBottom: 6,
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
  ledgerDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  ledgerLineText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.45)',
    fontFamily: 'SpaceGrotesk_500Medium',
  },
  columnDestination: {
    flex: 3,
    paddingLeft: 4,
  },
  ledgerDestText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.65)',
    fontFamily: 'SpaceGrotesk_500Medium',
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
