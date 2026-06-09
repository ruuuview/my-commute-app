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
import { getPillColors } from '../utils/pillColors';

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
  if (statusType === 'good') color = '#4CAF50';
  if (statusType === 'minor') color = '#F2A002';
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
  cardHeight?: number;
}

export function LineCard({
  line,
  selected,
  onPress,
  disabled = false,
  statusType,
  statusLabel,
  cardHeight = ONBOARDING_CARD_HEIGHT,
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
  const colors = getPillColors(line.id, line.color);

  // Selected border color (60% brand color opacity, with safe fallback colors for custom lines)
  const getSelectedBorderColor = () => {
    if (line.id === 'northern') return 'rgba(255, 255, 255, 0.55)';
    if (line.id === 'piccadilly') return '#60A5FA99';
    if (line.id === 'bakerloo') return '#F59E0B99';
    if (line.id === 'jubilee') return '#C8CDD199';
    if (line.id === 'circle') return '#FFD30099';
    if (line.id === 'hammersmith-city') return '#F3A9BB99';
    return `${line.color}99`;
  };

  // Border style is applied to cardInner (so it aligns with rounded glass clipping)
  const selectedBorderStyle = selected ? {
    borderWidth: 1.5,
    borderColor: getSelectedBorderColor(),
  } : {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  };

  // Glow style is applied to outerCard wrapper (since it has NO overflow: 'hidden')
  const selectedGlowStyle = selected ? {
    shadowColor: isNorthern ? 'rgba(255, 255, 255, 0.55)' : line.color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: isNorthern ? 0.6 : isJubilee ? 0.65 : 0.5,
    shadowRadius: isNorthern ? 10 : isJubilee ? 10 : 8,
    elevation: 5,
  } : null;

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
    if (!label) return '';
    const cleanLabel = label.trim();
    const lowerLabel = cleanLabel.toLowerCase();
    for (const key of Object.keys(STATUS_SHORT)) {
      if (key.toLowerCase() === lowerLabel) {
        return STATUS_SHORT[key];
      }
    }
    return cleanLabel;
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

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={pressAnim.onPressIn}
      onPressOut={pressAnim.onPressOut}
      disabled={disabled}
      style={({ pressed }) => [
        styles.outerCard,
        { height: cardHeight },
        selectedGlowStyle,
        pressed && { opacity: 0.65 }
      ]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${line.name} line, status: ${statusLabel}${selected ? ', selected' : ''}`}
    >
      <Animated.View
        style={[
          styles.cardInner,
          selectedBorderStyle,
          !reducedMotion && pressAnim.animatedStyle
        ]}
      >
        {/* Frosted glass background layer with opaque fallback styling */}
        <BlurView
          intensity={45}
          tint="dark"
          style={[
            StyleSheet.absoluteFillObject,
            styles.blurBackground,
          ]}
        />

        {/* Brand color tint overlay for selected state (Apple pill design) */}
        {selected && (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.backgroundColor }]} />
        )}

        {/* Accent bar — centred vertically, 3px wide, rounded, placed 14px from left */}
        <View style={[
          styles.accentBar,
          { backgroundColor: line.color, top: (cardHeight - 36) / 2 },
          barGlowStyle
        ]} />

        {/* Content */}
        <View style={[styles.cardContent, { paddingRight: 8 }]}>
          <Text
            style={styles.lineName}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
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

        {/* Right selection badge consistent with StationCard.tsx */}
        {selected && (
          <View style={styles.rightBadgeContainer}>
            <View style={styles.addedCircle}>
              <Ionicons
                name="checkmark"
                size={12}
                color="#0044EE"
              />
            </View>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outerCard: {
    flex: 1,
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
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  accentBar: {
    position: 'absolute',
    left: 14,
    width: 3,
    height: 36, // Vertical height centered bar (strictly 36px)
    borderRadius: 2,
  },
  cardContent: {
    flex: 1,
    paddingLeft: 22, // 14px margin + 3px bar + 5px breathing room
    justifyContent: 'center',
  },
  lineName: {
    fontSize: 14,
    fontFamily: 'SpaceGrotesk_700Bold',
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
    fontFamily: 'SpaceGrotesk_500Medium',
    color: 'rgba(255, 255, 255, 0.55)',
  },
  rightBadgeContainer: {
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addedCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(0,0,0,0.12)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 3,
  },
});
