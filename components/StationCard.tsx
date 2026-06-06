import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { usePressAnimation } from '../hooks/usePressAnimation';
import { tflCapitalise } from '../utils/tflCapitalise';
import { cleanDisplayStationName } from '../data/tflStations';
import { LINE_COLORS } from '../constants/lineColors';
import { LINE_SHORT_NAMES, DARK_LINE_IDS } from '../data/lineMetadata';
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
  overground: ['Watford Junction', 'Clapham Junction', 'Highbury & Islington'],
  dlr: ['Bank', 'Lewisham', 'Beckton', 'Woolwich Arsenal'],
};

function getSeedOffset(stationId: string): number {
  let sum = 0;
  for (let i = 0; i < stationId.length; i++) {
    sum += stationId.charCodeAt(i);
  }
  return sum % 5;
}

function hexToRgba(hex: string, opacity: number): string {
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length !== 6) return `rgba(255,255,255,${opacity})`;
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
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

  let index = 0;
  while (departures.length < count && index < 15) {
    const lineId = linesList[index % linesList.length];
    const minHeadway = headwayMins[lineId] ?? 3;
    
    const lastVal = lastMinsForLineDirection[lineId];
    let mins = 0;
    if (lastVal === undefined) {
      mins = (seed + index * 2) % 6;
    } else {
      mins = lastVal + minHeadway + ((seed + index) % 3);
    }
    
    lastMinsForLineDirection[lineId] = mins;

    const shortName = LINE_SHORT_NAMES[lineId] || lineId;
    const terminals = LINE_TERMINALS[lineId] || ['Central London'];
    const destination = terminals[(index + seed) % terminals.length];

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

  const displayDepartures = useMemo(() => {
    const isDashboardMode = mode === 'dashboard';
    const shouldShow = showLedger || isDashboardMode;
    if (!shouldShow) return [];
    return (departures ?? generateMockDepartures(station.id, station.lines, 3)).slice(0, 3);
  }, [station.id, station.lines, showLedger, departures, mode]);

  const activeBorderColor = useMemo(() => {
    if (mode === 'onboarding' && selected) {
      return 'rgba(255, 255, 255, 0.55)';
    }
    return 'rgba(255, 255, 255, 0.13)';
  }, [mode, selected]);

  const handlePress = () => {
    if (disabled) return;
    onPress?.();
  };

  const getDepTimeColor = (timeStr: string) => {
    const minutes = parseInt(timeStr) || 0;
    if (minutes <= 2) {
      return IMMINENT_BLUE;
    }
    if (minutes <= 9) {
      return 'rgba(255,255,255,0.90)';
    }
    return 'rgba(255,255,255,0.45)';
  };

  const renderLinePills = () => {
    if (!station.lines || station.lines.length === 0) return null;
    const isOverflow = station.lines.length > 4;
    const scrollStyle = isOverflow ? { maxWidth: 200 } : null;
    return (
      <View style={styles.pillsRowWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={scrollStyle}
          contentContainerStyle={styles.pillsScrollContainer}
        >
          {station.lines.map((lineId) => {
            const shortName = LINE_SHORT_NAMES[lineId] || lineId;
            const brandColor = LINE_COLORS[lineId] || '#888';
            
            const isDark = DARK_LINE_IDS.has(lineId);
            
            const bg = isDark ? 'rgba(255,255,255,0.10)' : hexToRgba(brandColor, 0.15);
            const border = isDark ? 'rgba(255,255,255,0.25)' : hexToRgba(brandColor, 0.35);
            const text = isDark ? 'rgba(255,255,255,0.80)' : hexToRgba(brandColor, 0.90);

            return (
              <View
                key={lineId}
                style={[
                  styles.linePill,
                  { backgroundColor: bg, borderColor: border }
                ]}
                accessibilityLabel={`${shortName} line`}
                accessibilityRole="text"
              >
                <Text style={[styles.linePillText, { color: text }]}>
                  {shortName}
                </Text>
              </View>
            );
          })}
        </ScrollView>
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
                  const timeColor = getDepTimeColor(dep.timeText);

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
                        <Text 
                          style={[
                            styles.ledgerTimeText, 
                            { color: timeColor }
                          ]} 
                          numberOfLines={1}
                        >
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outerCard: {
    alignSelf: 'stretch',
    borderRadius: 18,
    marginBottom: 9,
    borderWidth: 1,
    minHeight: 68,
    position: 'relative',
    overflow: 'hidden',
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
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  stationName: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'System',
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
    marginTop: 5,
    marginBottom: 8,
  },
  pillsScrollContainer: {
    flexDirection: 'row',
    gap: 5,
  },
  linePill: {
    height: 18,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 50,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  linePillText: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'System',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    marginBottom: 9,
  },
  ledgerTable: {
    gap: 0,
  },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 7,
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
    fontFamily: 'System',
  },
  columnDestination: {
    flex: 3,
    paddingLeft: 4,
  },
  ledgerDestText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.65)',
    fontFamily: 'System',
  },
  columnCountdown: {
    width: 38,
    alignItems: 'flex-end',
  },
  ledgerTimeText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'System',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});
