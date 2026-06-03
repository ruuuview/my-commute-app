import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { usePressAnimation } from '../hooks/usePressAnimation';

interface LineCardProps {
  line: {
    id: string;
    name: string;
    color: string;
    stationCount: number;
  };
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}

export function LineCard({ line, selected, onPress, disabled = false }: LineCardProps) {
  const reducedMotion = useReducedMotion();
  const configKey = selected ? 'line_deselect' : 'line_select';
  const pressAnim = usePressAnimation(configKey, disabled);

  // Card unselected color is #434875. Selected is #0A0F3C.
  const nameStyle = selected ? styles.lineNameSelected : styles.lineNameUnselected;

  // Selected shadow styling for iOS
  const selectedShadowStyle = selected ? {
    shadowColor: line.color,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
  } : {};

  // Custom border color/width when selected
  const selectedBorder = selected ? {
    borderWidth: 1.5,
    borderColor: line.color,
  } : {
    borderWidth: 0.5,
    borderColor: 'rgba(10,20,100,0.10)',
  };

  return (
    <Pressable onPress={onPress} disabled={disabled} style={styles.outerCard}>
      <Animated.View 
        style={[
          styles.cardInner, 
          selectedBorder, 
          selectedShadowStyle, 
          !reducedMotion && pressAnim.animatedStyle
        ]}
      >
        {/* Accent bar — flush left, full height, no radius. Parent overflow:hidden handles the rounding clip */}
        <View style={[styles.accentBar, { backgroundColor: line.color }]} />
        
        {/* Content */}
        <View style={styles.cardContent}>
          <Text style={[styles.lineName, nameStyle]} numberOfLines={1}>
            {line.name}
          </Text>
          <Text style={styles.lineMeta} accessibilityElementsHidden={true}>
            {line.stationCount} stations
          </Text>
        </View>
        
        {/* Selected check badge */}
        {selected && (
          <View style={[styles.checkBadge, { backgroundColor: line.color }]}>
            <Ionicons name="checkmark" size={10} color="#FFFFFF" />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outerCard: {
    height: 72,
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    // iOS shadow
    shadowColor: 'rgba(0,20,100,1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    // Android elevation
    elevation: 3,
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
  lineName: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'System', // system font falls back to SF Pro Display/Text on iOS
  },
  lineNameSelected: {
    color: '#0A0F3C',
  },
  lineNameUnselected: {
    color: '#434875',
  },
  lineMeta: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(10,15,60,0.38)',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  checkBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
});
