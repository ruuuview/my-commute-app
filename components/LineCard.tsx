import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { usePressAnimation } from '../hooks/usePressAnimation';
import * as Haptics from 'expo-haptics';
import { playSound } from '../utils/sound';
import { STATUS_SHORT } from '../constants/statusLabels';

function hexToRgba(hex: string, alpha: number): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function StatusSkeleton() {
  const opacity = useSharedValue(0.35);
  const reducedMotion = useReducedMotion();

  React.useEffect(() => {
    if (reducedMotion) return;
    opacity.value = withRepeat(
      withTiming(0.75, { duration: 650 }),
      -1,
      true
    );
  }, [reducedMotion, opacity]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View 
      style={[
        {
          width: 7,
          height: 7,
          borderRadius: 3.5,
          backgroundColor: 'rgba(255,255,255,0.12)',
        },
        style
      ]}
    />
  );
}

const StatusDot = React.memo(function StatusDot({ statusType }: { statusType: string }) {
  const pulse = useSharedValue(0.4);
  const reducedMotion = useReducedMotion();

  React.useEffect(() => {
    if (reducedMotion) return;
    if (statusType === 'severe') {
      pulse.value = withRepeat(
        withTiming(1, { duration: 1000 }),
        -1,
        true
      );
    } else if (statusType === 'suspended') {
      pulse.value = withRepeat(
        withTiming(1, { duration: 500 }),
        -1,
        true
      );
    }
  }, [statusType, reducedMotion, pulse]);

  const animatedStyle = useAnimatedStyle(() => {
    if (statusType === 'severe' || statusType === 'suspended') {
      return { opacity: pulse.value };
    }
    return { opacity: 1 };
  });

  let color = '#9CA3AF';
  if (statusType === 'good') color = '#22C55E';
  if (statusType === 'minor') color = '#F59E0B';
  if (statusType === 'severe' || statusType === 'suspended') color = '#EF4444';

  return (
    <Animated.View
      accessibilityLabel={`Status: ${statusType}`}
      style={[
        {
          width: 7,
          height: 7,
          borderRadius: 3.5,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
});

interface LineCardProps {
  line: {
    id: string;
    name: string;
    color: string;
  };
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  statusType: 'good' | 'minor' | 'severe' | 'suspended' | 'closure' | 'loading' | 'error';
  statusLabel: string;
  isPearlZone?: boolean;
  isWide?: boolean;
}

export function LineCard({
  line,
  selected,
  onPress,
  disabled = false,
  statusType,
  statusLabel,
  isPearlZone = false,
  isWide = false,
}: LineCardProps) {
  const opacityVal = useSharedValue(0);
  
  React.useEffect(() => {
    if (statusType !== 'loading') {
      opacityVal.value = withTiming(1, { duration: 200 });
    } else {
      opacityVal.value = 0;
    }
  }, [statusType, opacityVal]);

  const animatedStatusStyle = useAnimatedStyle(() => ({
    opacity: opacityVal.value,
  }));

  const selectedStyle = selected ? {
    borderWidth: 1,
    borderColor: hexToRgba(line.color, 0.6),
    backgroundColor: hexToRgba(line.color, 0.12),
  } : (isPearlZone ? {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.90)',
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    shadowColor: 'rgba(10, 15, 60, 0.10)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 3,
  } : {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  });

  const reducedMotion = useReducedMotion();
  const configKey = selected ? 'line_deselect' : 'line_select';
  const pressAnim = usePressAnimation(configKey, disabled);
  
  const nameStyle = selected 
    ? styles.lineNameSelected 
    : (isPearlZone ? styles.lineNameUnselectedPearl : styles.lineNameUnselectedTop);

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
    
    onPress();
  };

  const abbreviateStatus = (label: string): string => {
    return STATUS_SHORT[label] ?? label;
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      style={styles.outerCard}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${line.name} line, status: ${statusLabel}${selected ? ', selected' : ''}`}
    >
      <Animated.View 
        style={[
          styles.cardInner, 
          selectedStyle, 
          !reducedMotion && pressAnim.animatedStyle
        ]}
      >
        {/* Accent bar — flush left, matching cardInner rounding */}
        <View style={[styles.accentBar, { backgroundColor: line.color }]} />
        
        {/* Content */}
        <View style={styles.cardContent}>
          <Text style={[styles.lineName, nameStyle]} numberOfLines={1} ellipsizeMode="tail">
            {line.name}
          </Text>
          
          <View style={styles.statusSubRow}>
            {statusType === 'loading' ? (
              <StatusSkeleton />
            ) : (
              <Animated.View style={[styles.statusRowLayout, animatedStatusStyle]}>
                <StatusDot statusType={statusType} />
                <Text style={[styles.statusText, isPearlZone ? styles.statusTextPearl : styles.statusTextTop]} numberOfLines={1}>
                  {abbreviateStatus(statusLabel)}
                </Text>
              </Animated.View>
            )}
          </View>
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
  },
  cardInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    position: 'relative',
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
  lineName: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'System',
  },
  lineNameSelected: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  lineNameUnselectedTop: {
    color: 'rgba(255,255,255,0.72)',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  lineNameUnselectedPearl: {
    color: 'rgba(10,15,60,0.72)',
  },
  statusSubRow: {
    marginTop: 4,
    height: 16,
    justifyContent: 'center',
  },
  statusRowLayout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'System',
  },
  statusTextTop: {
    color: 'rgba(255,255,255,0.60)',
  },
  statusTextPearl: {
    color: 'rgba(10,15,60,0.60)',
  },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
