import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { usePressAnimation } from '../hooks/usePressAnimation';
import * as Haptics from 'expo-haptics';
import { playSound } from '../utils/sound';
import { STATUS_SHORT } from '../constants/statusLabels';
import { ONBOARDING_CARD_HEIGHT } from '../constants/layout';
import { BlurView } from 'expo-blur';

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
  const pulse = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  React.useEffect(() => {
    if (reducedMotion) return;
    if (statusType === 'closure') {
      pulse.value = 0.4;
      pulse.value = withRepeat(
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      pulse.value = 1;
    }
  }, [statusType, reducedMotion, pulse]);

  const animatedStyle = useAnimatedStyle(() => {
    if (statusType === 'closure') {
      return { opacity: pulse.value };
    }
    return { opacity: 1 };
  });

  let color = '#9CA3AF';
  if (statusType === 'good')                                    color = '#4CAF50';
  if (statusType === 'minor')                                   color = '#F2A002';
  if (statusType === 'severe' || statusType === 'suspended' || statusType === 'closure') color = '#E32017';

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
}

export function LineCard({
  line,
  selected,
  onPress,
  disabled = false,
  statusType,
  statusLabel,
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

  const isNorthern = line.id === 'northern';
  const isJubilee = line.id === 'jubilee';

  const selectedBorderColor = isNorthern 
    ? 'rgba(255, 255, 255, 0.70)' 
    : isJubilee 
    ? '#C8CDD1' 
    : line.color;

  const selectedGlowColor = isNorthern 
    ? '#000000' 
    : isJubilee 
    ? '#A0A5A9' 
    : line.color;

  const selectedStyle = selected ? {
    borderWidth: 2,
    borderColor: selectedBorderColor,
    shadowColor: selectedGlowColor,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: isNorthern ? 0.9 : isJubilee ? 0.7 : 0.55,
    shadowRadius: isNorthern ? 12 : isJubilee ? 10 : 8,
    elevation: 6,
  } : {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  };

  const reducedMotion = useReducedMotion();
  const configKey = selected ? 'line_deselect' : 'line_select';
  const pressAnim = usePressAnimation(configKey, disabled);

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

  // Add a subtle outer glow for dark lines (e.g. Northern)
  const isDarkLine = line.id === 'northern';
  const barGlowStyle = isDarkLine ? {
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  } : null;

  // Conditionally apply right padding to avoid checkmark badge collision when selected
  const contentPaddingRight = selected ? 28 : 12;

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={pressAnim.onPressIn}
      onPressOut={pressAnim.onPressOut}
      disabled={disabled}
      style={({ pressed }) => [styles.outerCard, pressed && { opacity: 0.65 }]}
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
        {/* Frosted glass background layer with opaque fallback styling */}
        <BlurView
          intensity={30}
          tint="dark"
          style={[
            StyleSheet.absoluteFillObject, 
            styles.blurBackground,
            selected && isNorthern && { backgroundColor: 'rgba(0, 0, 0, 0.60)' },
            selected && isJubilee && { backgroundColor: 'rgba(160, 165, 169, 0.12)' },
          ]}
        />

        {/* Accent bar — centred 36px vertically, 3px wide, rounded, placed 14px from left */}
        <View style={[styles.accentBar, { backgroundColor: line.color }, barGlowStyle]} />
        
        {/* Content */}
        <View style={[styles.cardContent, { paddingRight: contentPaddingRight }]}>
          <Text style={styles.lineName} numberOfLines={1} ellipsizeMode="tail">
            {line.name}
          </Text>
          
          <View style={styles.statusSubRow}>
            {statusType === 'loading' ? (
              <StatusSkeleton />
            ) : (
              <Animated.View style={[styles.statusRowLayout, animatedStatusStyle]}>
                <StatusDot statusType={statusType} />
                <Text style={styles.statusText} numberOfLines={1}>
                  {abbreviateStatus(statusLabel)}
                </Text>
              </Animated.View>
            )}
          </View>
        </View>
        
        {/* Selected check badge — 18px white circle, dark check */}
        {selected && (
          <View style={styles.checkBadge}>
            <Ionicons name="checkmark" size={12} color="#0A0F3C" />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outerCard: {
    flex: 1,
    height: ONBOARDING_CARD_HEIGHT,
    borderRadius: 18,
  },
  cardInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    position: 'relative',
    overflow: 'hidden',
  },
  blurBackground: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  accentBar: {
    position: 'absolute',
    left: 14,
    top: 16, // Centred in 68px height: (68 - 36) / 2 = 16
    width: 3,
    height: 36,
    borderRadius: 2,
  },
  cardContent: {
    flex: 1,
    paddingLeft: 22, // 14px margin + 3px bar + 5px breathing room
    justifyContent: 'center',
  },
  lineName: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'System',
    color: 'rgba(255, 255, 255, 0.95)',
  },
  statusSubRow: {
    marginTop: 4,
    height: 16,
    justifyContent: 'center',
  },
  statusRowLayout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'System',
    color: 'rgba(255, 255, 255, 0.55)',
  },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
