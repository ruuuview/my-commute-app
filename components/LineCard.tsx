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
  FadeIn,
  FadeOut,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';
import { usePressAnimation } from '../hooks/usePressAnimation';
import * as Haptics from 'expo-haptics';
import { playSound } from '../utils/sound';
import { STATUS_SHORT } from '../constants/statusLabels';
import { ONBOARDING_CARD_HEIGHT } from '../constants/layout';
import { BlurView } from 'expo-blur';
import { StatusBezel } from './StatusBezel';

function withAlpha(hexColor: string, alpha: string): string {
  const hex = hexColor.startsWith('#') ? hexColor : `#${hexColor}`;
  return `${hex}${alpha}`;
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
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: 'rgba(255,255,255,0.12)',
        },
        style
      ]}
    />
  );
}



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

  // Uniform hairline border — no state change, no brand color bleed
  const selectedBorderStyle = {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  };

  // Glow explicitly zeroed — prevents iOS shadow residual and Android elevation diff
  const selectedGlowStyle = {
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
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

  let statusTextColor = 'rgba(255, 255, 255, 0.55)';
  if (statusType === 'good') statusTextColor = '#30D158';
  else if (statusType === 'minor') statusTextColor = '#FF9F0A';
  else if (statusType === 'severe') statusTextColor = '#FF3B30';
  else if (statusType === 'suspended' || statusType === 'closure') statusTextColor = '#636366';

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
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: withAlpha(line.color, '1A') }]} />
        )}

        {/* Accent bar — centred vertically, 3px wide, rounded, placed 14px from left */}
        <View style={[
          styles.accentBar,
          { backgroundColor: line.color, top: (cardHeight - 36) / 2 }
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
                <StatusBezel statusType={statusType} />
                <Text style={[styles.statusText, { color: statusTextColor }]} numberOfLines={1}>
                  {STATUS_SHORT[statusLabel] || statusLabel}
                </Text>
              </Animated.View>
            )}
          </View>
        </View>

        {/* Right selection badge consistent with StationCard.tsx */}
        {selected && (
          <Animated.View
            entering={FadeIn.duration(150)}
            exiting={FadeOut.duration(100)}
            style={styles.rightBadgeContainer}
          >
            <Animated.View entering={ZoomIn.duration(200).springify()} exiting={ZoomOut.duration(100)}>
              <View style={styles.addedCircle}>
                <Ionicons
                  name="checkmark"
                  size={12}
                  color="#07103a"
                />
              </View>
            </Animated.View>
          </Animated.View>
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
    fontSize: 12,
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
