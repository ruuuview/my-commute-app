import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { usePressAnimation } from '../hooks/usePressAnimation';
import { tflCapitalise } from '../utils/tflCapitalise';
import { LINE_COLORS } from '../constants/lineColors';

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
}

export function StationCard({
  station,
  primaryLineColor,
  rightElement,
  onPress,
  disabled = false,
}: StationCardProps) {
  const reducedMotion = useReducedMotion();
  const pressAnim = usePressAnimation('station_row', disabled);

  const cleanName = tflCapitalise(station.name);

  return (
    <Pressable onPress={onPress} disabled={disabled} style={styles.outerCard}>
      <Animated.View
        style={[
          styles.cardInner,
          !reducedMotion && pressAnim.animatedStyle,
        ]}
      >
        {/* Accent bar — flush left, full height, no radius. Parent overflow:hidden clips it */}
        <View style={[styles.accentBar, { backgroundColor: primaryLineColor }]} />

        {/* Content */}
        <View style={styles.cardContent}>
          <Text style={styles.stationName} numberOfLines={1}>
            {cleanName}
          </Text>
          
          <View style={styles.subtitleRow}>
            <View style={styles.dotsContainer}>
              {station.lines.slice(0, 4).map((lineId) => (
                <View
                  key={lineId}
                  style={[
                    styles.lineDot,
                    { backgroundColor: LINE_COLORS[lineId] || '#888' }
                  ]}
                />
              ))}
              {station.lines.length > 4 && (
                <Text style={styles.overflowText}>
                  +{station.lines.length - 4}
                </Text>
              )}
            </View>
            {station.zone !== undefined && (
              <Text style={styles.zoneText}>
                {station.lines.length > 0 ? '· ' : ''}Zone {station.zone}
              </Text>
            )}
          </View>
        </View>

        {/* Right Element (Add button, checkmark, or static/live badge) */}
        {rightElement && (
          <View style={styles.rightContainer}>
            {rightElement}
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outerCard: {
    height: 68,
    alignSelf: 'stretch',
    borderRadius: 14,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    // iOS shadow
    shadowColor: 'rgba(0,20,100,1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    // Android elevation
    elevation: 2,
  },
  cardInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
  },
  accentBar: {
    width: 3.5,
    alignSelf: 'stretch',
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  cardContent: {
    flex: 1,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  stationName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0A0F3C',
    fontFamily: 'System',
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    height: 16,
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  lineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  overflowText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(10,15,60,0.45)',
    marginLeft: 2,
    fontFamily: 'System',
  },
  zoneText: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(10,15,60,0.45)',
    marginLeft: 4,
    fontFamily: 'System',
  },
  rightContainer: {
    paddingRight: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
