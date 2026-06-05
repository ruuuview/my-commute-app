import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { usePressAnimation } from '../hooks/usePressAnimation';
import { tflCapitalise } from '../utils/tflCapitalise';
import { LINE_COLORS, LINE_NAMES } from '../constants/lineColors';
import * as Haptics from 'expo-haptics';
import { playSound } from '../utils/sound';

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
  isPearlZone?: boolean;
  departures?: Departure[];
}

const LINE_TERMINALS: Record<string, string[]> = {
  'northern': ['Morden', 'Edgware', 'Mill Hill East', 'High Barnet'],
  'central': ['Epping', 'Hainault', 'Ruislip Gardens', 'West Ruislip'],
  'elizabeth': ['Reading', 'Heathrow T5', 'Shenfield', 'Abbey Wood'],
  'jubilee': ['Stanmore', 'Stratford'],
  'victoria': ['Brixton', 'Walthamstow Central'],
  'piccadilly': ['Cockfosters', 'Heathrow T5', 'Uxbridge'],
  'district': ['Richmond', 'Wimbledon', 'Ealing Broadway', 'Upminster'],
  'circle': ['Hammersmith', 'Edgware Road'],
  'bakerloo': ['Harrow & Wealdstone', 'Elephant & Castle'],
  'metropolitan': ['Aldgate', 'Watford', 'Amersham', 'Uxbridge'],
  'hammersmith-city': ['Hammersmith', 'Barking'],
  'overground': ['Watford Junction', 'Clapham Junction', 'Highbury & Islington'],
  'dlr': ['Bank', 'Lewisham', 'Beckton', 'Woolwich Arsenal'],
};

function getSeedOffset(stationId: string): number {
  let sum = 0;
  for (let i = 0; i < stationId.length; i++) {
    sum += stationId.charCodeAt(i);
  }
  return sum % 5;
}

function generateMockDepartures(stationId: string, lines: string[], count = 3): Departure[] {
  const departures: Departure[] = [];
  const linesList = lines.length > 0 ? lines : ['central'];
  
  const seed = getSeedOffset(stationId);
  const baseMinutes = [2, 7, 13].map(m => m + seed);

  for (let i = 0; i < count; i++) {
    const lineId = linesList[i % linesList.length];
    const canonicalName = LINE_NAMES[lineId] || (lineId.charAt(0).toUpperCase() + lineId.slice(1));
    const terminals = LINE_TERMINALS[lineId] || ['Central London'];
    const dest = terminals[i % terminals.length];
    
    const minutes = baseMinutes[i];
    const timeText = `${minutes} min`;
    const isImminent = i === 0;

    departures.push({
      lineId,
      lineColor: LINE_COLORS[lineId] || '#888',
      lineName: canonicalName,
      destination: dest,
      timeText,
      isImminent,
    });
  }
  return departures;
}

export function StationCard({
  station,
  primaryLineColor,
  rightElement,
  onPress,
  disabled = false,
  selected = false,
  showLedger = false,
  isPearlZone = false,
  departures,
}: StationCardProps) {
  const reducedMotion = useReducedMotion();
  const pressAnim = usePressAnimation('station_row', disabled);

  const cleanName = tflCapitalise(station.name);

  const displayDepartures = useMemo(() => {
    if (!showLedger) return [];
    return departures ?? generateMockDepartures(station.id, station.lines, 3);
  }, [station.id, station.lines, showLedger, departures]);

  const nextArrivalText = displayDepartures[0]?.timeText || '';

  const handlePress = () => {
    if (disabled) return;

    const timestamp = Date.now();
    console.log(`[AUDIO_TRIGGER] playSound at ${timestamp} (selected: ${selected})`);

    if (selected) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      playSound('deselect', 0.35);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      playSound('select', 0.45);
    }

    onPress?.();
  };

  const cardStyle = isPearlZone ? styles.outerCardPearl : styles.outerCardTop;
  const textStyle = isPearlZone ? styles.textPearl : styles.textTop;
  const stationNameStyle = isPearlZone ? styles.stationNamePearl : styles.stationNameTop;

  return (
    <Pressable 
      onPress={handlePress} 
      disabled={disabled} 
      style={[
        styles.outerCard, 
        cardStyle, 
        showLedger && styles.outerCardLedger
      ]}
    >
      <Animated.View
        style={[
          styles.cardInner,
          !reducedMotion && pressAnim.animatedStyle,
          { paddingVertical: showLedger ? 10 : 0 },
        ]}
      >
        {/* Accent bar — flush left */}
        <View style={[styles.accentBar, { backgroundColor: primaryLineColor }]} />

        {/* Content */}
        <View style={styles.cardContent}>
          {/* Header Row */}
          <View style={styles.cardHeaderRow}>
            <View style={styles.headerLeft}>
              <View style={[styles.statusCircle, { backgroundColor: primaryLineColor }]} />
              <Text style={[styles.stationName, stationNameStyle]} numberOfLines={1}>
                {cleanName}
              </Text>
            </View>
            
            {showLedger ? (
              <Text style={[styles.nextArrivalText, textStyle]}>
                {nextArrivalText}
              </Text>
            ) : (
              rightElement && (
                <View style={styles.rightContainer}>
                  {rightElement}
                </View>
              )
            )}
          </View>

          {/* Ledger table */}
          {showLedger && displayDepartures.length > 0 && (
            <View style={styles.ledgerTable}>
              {displayDepartures.map((dep, idx) => (
                <View key={idx} style={styles.ledgerRow}>
                  {/* Column 1: Identity (flex: 2) */}
                  <View style={styles.columnIdentity}>
                    <View style={[styles.ledgerDot, { backgroundColor: dep.lineColor }]} />
                    <Text style={[styles.ledgerLineText, textStyle]} numberOfLines={1}>
                      {dep.lineName}
                    </Text>
                  </View>

                  {/* Column 2: Destination (flex: 3) */}
                  <View style={styles.columnDestination}>
                    <Text style={[styles.ledgerDestText, textStyle]} numberOfLines={1} ellipsizeMode="tail">
                      {dep.destination}
                    </Text>
                  </View>

                  {/* Column 3: Countdown (flex: 1.2) */}
                  <View style={styles.columnCountdown}>
                    <Text 
                      style={[
                        styles.ledgerTimeText, 
                        idx === 0 ? styles.imminentTimeText : textStyle
                      ]} 
                      numberOfLines={1}
                    >
                      {dep.timeText}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outerCard: {
    alignSelf: 'stretch',
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 1,
  },
  outerCardTop: {
    height: 68,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  outerCardPearl: {
    borderColor: 'rgba(255, 255, 255, 0.90)',
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    shadowColor: 'rgba(10, 15, 60, 0.10)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 3,
  },
  outerCardLedger: {
    height: undefined,
    minHeight: 110,
  },
  cardInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
  },
  accentBar: {
    width: 3,
    alignSelf: 'stretch',
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  cardContent: {
    flex: 1,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusCircle: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  stationName: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'System',
    flex: 1,
  },
  stationNameTop: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  stationNamePearl: {
    color: '#0A0F3C',
  },
  nextArrivalText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'System',
    fontVariant: ['tabular-nums'],
    paddingRight: 4,
  },
  textTop: {
    color: 'rgba(255, 255, 255, 0.70)',
  },
  textPearl: {
    color: 'rgba(10, 15, 60, 0.65)',
  },
  rightContainer: {
    paddingRight: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ledgerTable: {
    marginTop: 8,
    width: '100%',
    gap: 4,
  },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    height: 18,
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
    fontWeight: '600',
    fontFamily: 'System',
  },
  columnDestination: {
    flex: 3,
  },
  ledgerDestText: {
    fontSize: 11,
    fontWeight: '500',
    fontFamily: 'System',
  },
  columnCountdown: {
    flex: 1.2,
  },
  ledgerTimeText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'System',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  imminentTimeText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'System',
    color: '#F59E0B',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});
