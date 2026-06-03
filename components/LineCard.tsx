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

// WCAG AA compliant text color mappings for white backgrounds
const STATUS_TEXT_COLORS: Record<string, string> = {
  'circle':              '#7A6800', // darkened from #FFD300
  'hammersmith-city':    '#A8294A', // darkened from #F3A9BB
  'waterloo-city':       '#1F7A5C', // darkened from #93CEBA
  'overground':          '#B85A00', // darkened from #EE7C0E
  'elizabeth':           '#6B3A9B', // darkened from #9B59C6
  'victoria':            '#006B97', // darkened from #0098D4
  'northern':            '#444444', // softened from #1A1A1A
};

function getStatusTextColor(lineId: string, statusType: string, brandColor: string): string {
  switch (statusType) {
    case 'good':
      return STATUS_TEXT_COLORS[lineId] || brandColor;
    case 'minor':
      return '#B85A00'; // Darkened amber for contrast
    case 'severe':
    case 'suspended':
      return '#B91C1C'; // Red
    case 'closure':
      return '#4B5563'; // Gray
    default:
      return 'rgba(10,15,60,0.38)';
  }
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
  }, [reducedMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View 
      style={[
        {
          width: 44,
          height: 10,
          borderRadius: 5,
          backgroundColor: 'rgba(10,15,60,0.12)',
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
        withTiming(1, { duration: 1000 }), // 2s loop
        -1,
        true
      );
    } else if (statusType === 'suspended') {
      pulse.value = withRepeat(
        withTiming(1, { duration: 500 }), // 1s loop
        -1,
        true
      );
    }
  }, [statusType, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => {
    if (statusType === 'severe' || statusType === 'suspended') {
      return { opacity: pulse.value };
    }
    return { opacity: 1 };
  });

  let color = '#9CA3AF'; // closure/error/unknown
  if (statusType === 'good') color = '#22C55E';
  if (statusType === 'minor') color = '#F59E0B';
  if (statusType === 'severe' || statusType === 'suspended') color = '#EF4444';

  return (
    <Animated.View
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
}

export function LineCard({
  line,
  selected,
  onPress,
  disabled = false,
  statusType,
  statusLabel,
}: LineCardProps) {
  const reducedMotion = useReducedMotion();
  const configKey = selected ? 'line_deselect' : 'line_select';
  const pressAnim = usePressAnimation(configKey, disabled);

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

  const opacityVal = useSharedValue(0);
  
  React.useEffect(() => {
    if (statusType !== 'loading') {
      opacityVal.value = withTiming(1, { duration: 200 });
    } else {
      opacityVal.value = 0;
    }
  }, [statusType]);

  const animatedStatusStyle = useAnimatedStyle(() => ({
    opacity: opacityVal.value,
  }));

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
        {/* Accent bar — flush left, rounded top/bottom left to match cardInner rounding */}
        <View style={[styles.accentBar, { backgroundColor: line.color }]} />
        
        {/* Content */}
        <View style={styles.cardContent}>
          <Text style={[styles.lineName, nameStyle]} numberOfLines={1}>
            {line.name}
          </Text>
          
          {/* Status Slot — 16px fixed height to prevent CLS */}
          <View style={styles.statusSlot}>
            {statusType === 'loading' ? (
              <StatusSkeleton />
            ) : (
              <Animated.View style={[styles.statusRow, animatedStatusStyle]}>
                <StatusDot statusType={statusType} />
                <Text
                  style={[
                    styles.statusText,
                    { color: getStatusTextColor(line.id, statusType, line.color) }
                  ]}
                  numberOfLines={1}
                >
                  {statusLabel}
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
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
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
    fontFamily: 'System', // system font falls back to SF Pro Display/Text on iOS
  },
  lineNameSelected: {
    color: '#0A0F3C',
  },
  lineNameUnselected: {
    color: '#434875',
  },
  statusSlot: {
    height: 16,
    justifyContent: 'center',
    marginTop: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontFamily: 'System',
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
