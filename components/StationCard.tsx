import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { usePressAnimation } from '../hooks/usePressAnimation';
import { tflCapitalise } from '../utils/tflCapitalise';

interface StationCardProps {
  station: {
    id: string;
    name: string;
    lines: string[];
    zone?: number;
  };
  primaryLineColor: string;
  primaryLineName: string;
  rightElement?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
}

export function StationCard({
  station,
  primaryLineColor,
  primaryLineName,
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
          <Text style={styles.lineName} numberOfLines={1}>
            {primaryLineName} {station.zone !== undefined ? `· Zone ${station.zone}` : ''}
          </Text>
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
    overflow: 'hidden',
    marginBottom: 8,
  },
  cardInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    // iOS shadow
    shadowColor: 'rgba(0,20,100,1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    // Android elevation
    elevation: 2,
  },
  accentBar: {
    width: 3.5,
    alignSelf: 'stretch',
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
  lineName: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(10,15,60,0.45)',
    marginTop: 2,
    fontFamily: 'System',
  },
  rightContainer: {
    paddingRight: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
