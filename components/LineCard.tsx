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
  // All other lines — brand color direct with 10% opacity
  return {
    borderColor: `${brandColor}66`,
    backgroundColor: `${brandColor}1A`,
    dotColor: brandColor,
    textColor: brandColor,
  };
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
  const colors = getPillColors(line.id, line.color);

  const selectedStyle = selected ? {
    borderWidth: 1.5,
    borderColor: colors.borderColor,
    shadowColor: colors.borderColor,
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
          ]}
        />

        {/* Brand color tint overlay for selected state (Apple pill design) */}
        {selected && (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.backgroundColor }]} />
        )}

        {/* Accent bar — centred 36px vertically, 3px wide, rounded, placed 14px from left */}
        <View style={[styles.accentBar, { backgroundColor: line.color }, barGlowStyle]} />

        {/* Content */}
        <View style={[styles.cardContent, { paddingLeft: 22, paddingRight: 12 }]}>
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
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outerCard: {
    flex: 1,
    height: ONBOARDING_CARD_HEIGHT,
    borderRadius: 26, // Fully rounded capsule pill shape (52 / 2 = 26)
  },
  cardInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 26, // Fully rounded capsule pill shape (52 / 2 = 26)
    position: 'relative',
    overflow: 'hidden',
  },
  blurBackground: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  accentBar: {
    position: 'absolute',
    left: 14,
    top: 12, // Centred in 52px height: (52 - 28) / 2 = 12
    width: 3,
    height: 28, // Height reduced to fit 52px card
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
});

