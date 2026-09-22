import React, { useEffect, memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  FadeIn,
  FadeOut,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';
import { usePressAnimation } from '../hooks/usePressAnimation';
import { useLiveReducedMotion } from '../hooks/useReducedMotion';
import * as Haptics from 'expo-haptics';
import { STATUS_SHORT } from '../constants/statusLabels';
import { getSeverityColor } from '../utils/getSeverityColor';
import { ONBOARDING_CARD_HEIGHT } from '../constants/layout';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { StatusBezel } from './StatusBezel';
import { GLASS } from '../theme/colors';
import { NORTHERN_SHADES } from '../constants/lineColors';
import { useReduceTransparency } from '../hooks/useReduceTransparency';

function withAlpha(hexColor: string, alpha: string): string {
  const hex = hexColor.startsWith('#') ? hexColor : `#${hexColor}`;
  return `${hex}${alpha}`;
}

function StatusSkeleton() {
  const opacity = useSharedValue(0.35);
  const reducedMotion = useLiveReducedMotion();

  useEffect(() => {
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
        style,
      ]}
    />
  );
}

export interface LineCardProps {
  line: {
    id: string;
    name: string;
    color: string;
    status?: string;
    reason?: string;
    /** Raw TfL statusSeverity code when available (dashboard lines carry it) */
    status_severity?: number;
  };
  selected: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  statusType: 'good' | 'minor' | 'severe' | 'suspended' | 'closure' | 'loading' | 'error' | 'unknown' | 'offline' | string;
  statusLabel: string;
  cardHeight?: number;

  // Dashboard modes & properties:
  mode?: 'select' | 'display';
  onDelete?: (id: string) => void;
  drag?: () => void;
  isActive?: boolean;
  index?: number;
  onMoveUp?: (index: number) => void;
  onMoveDown?: (index: number) => void;
}

export const LineCard = memo(function LineCard({
  line,
  selected,
  onPress,
  onLongPress,
  disabled = false,
  statusType,
  statusLabel,
  cardHeight = ONBOARDING_CARD_HEIGHT,
  mode = 'select',
  drag,
  isActive = false,
}: LineCardProps) {
  const reduceTransparency = useReduceTransparency();
  const isSlim = cardHeight <= 48;
  const cardRadius = isSlim ? 16 : 18;
  const lineNameFontSize = cardHeight >= 44 ? 14 : (isSlim ? 13 : 14);
  const lineNameFontFamily = isSlim ? 'SpaceGrotesk_600SemiBold' : 'SpaceGrotesk_700Bold';
  const statusTextFontSize = cardHeight >= 44 ? 12 : (isSlim ? 11 : 12);
  const leftAccentBarPosition = isSlim ? 14 : 16;
  const cardPaddingLeft = isSlim ? 30 : 34;

  const opacityVal = useSharedValue(0);

  useEffect(() => {
    if (statusType !== 'loading') {
      opacityVal.value = withTiming(1, { duration: 200 });
    } else {
      opacityVal.value = 0;
    }
  }, [statusType, opacityVal]);

  const animatedStatusStyle = useAnimatedStyle(() => ({
    opacity: opacityVal.value,
  }));

  const configKey = selected ? 'line_deselect' : 'line_select';
  const pressAnim = usePressAnimation(configKey, disabled, isActive);

  const handlePress = () => {
    if (disabled) return;

    if (mode === 'select') {
      if (selected) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }

      if (onPress) onPress();
    } else {
      pressAnim.onPress(onPress);
    }
  };

  const handleLongPress = () => {
    if (disabled) return;
    if (drag) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      drag();
    } else if (onLongPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      onLongPress();
    }
  };

  let statusTextColor = getSeverityColor(line.status_severity, statusLabel).color;
  if (statusType === 'error') statusTextColor = '#FF3B30';
  else if (statusType === 'offline' || statusType === 'unknown') statusTextColor = 'rgba(255, 255, 255, 0.55)';

  const isNorthern = line.id === 'northern';

  return (
    <Animated.View
      style={[
        styles.outerCard,
        { height: cardHeight, borderRadius: cardRadius, zIndex: 1 },
      ]}
    >
      <Animated.View
        style={[
          styles.cardInner,
          {
            borderRadius: cardRadius,
            backgroundColor: reduceTransparency ? '#1C1C1E' : GLASS.background,
            overflow: 'hidden',
            borderWidth: mode === 'select' && selected ? (isNorthern ? 1.75 : 1.5) : GLASS.borderWidth,
            borderColor: mode === 'select' && selected
              ? (isNorthern ? NORTHERN_SHADES.highlightBorder : withAlpha(line.color, 'E6'))
              : GLASS.borderColor,
            borderTopColor: mode === 'select' && selected
              ? (isNorthern ? NORTHERN_SHADES.highlightBorder : withAlpha(line.color, 'E6'))
              : GLASS.borderTop,
            borderBottomColor: mode === 'select' && selected
              ? (isNorthern ? NORTHERN_SHADES.highlightBorder : withAlpha(line.color, 'E6'))
              : GLASS.borderBottom,
          },
          pressAnim.animatedStyle,
          mode === 'display' ? pressAnim.liftBorderStyle : null,
        ]}
      >
        {!reduceTransparency && (
          <BlurView
            intensity={GLASS.blurIntensity}
            tint={GLASS.blurTint}
            pointerEvents="none"
            style={StyleSheet.absoluteFillObject}
          />
        )}

        {/* Specular top highlight falloff across upper curved surface */}
        {!reduceTransparency && (
          <LinearGradient
            colors={[GLASS.specularStart, GLASS.specularEnd]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 14,
              borderTopLeftRadius: cardRadius,
              borderTopRightRadius: cardRadius,
            }}
            pointerEvents="none"
          />
        )}

        {mode === 'select' && selected && (
          <View
            style={[
              StyleSheet.absoluteFillObject,
              {
                backgroundColor: isNorthern
                  ? NORTHERN_SHADES.highlightWash
                  : withAlpha(line.color, '1A'),
              },
            ]}
          />
        )}

        {/* Dedicated Apple Glass Border Overlay */}
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            {
              borderRadius: cardRadius,
              borderWidth: mode === 'select' && selected ? (isNorthern ? 1.75 : 1.5) : GLASS.borderWidth,
              borderColor: mode === 'select' && selected
                ? (isNorthern ? NORTHERN_SHADES.highlightBorder : withAlpha(line.color, 'E6'))
                : GLASS.borderColor,
              borderTopColor: mode === 'select' && selected
                ? (isNorthern ? NORTHERN_SHADES.highlightBorder : withAlpha(line.color, 'E6'))
                : GLASS.borderTop,
              borderBottomColor: mode === 'select' && selected
                ? (isNorthern ? NORTHERN_SHADES.highlightBorder : withAlpha(line.color, 'E6'))
                : GLASS.borderBottom,
            },
            mode === 'display' ? pressAnim.liftBorderStyle : null,
          ]}
          pointerEvents="none"
        />
        <View
          style={[
            styles.accentBar,
            {
              backgroundColor: isNorthern ? NORTHERN_SHADES.accentBar : line.color,
              left: leftAccentBarPosition,
              height: isSlim ? (cardHeight - 16) : 36,
              top: (cardHeight - (isSlim ? (cardHeight - 16) : 36)) / 2,
            },
          ]}
        />

        <Pressable
          onPress={handlePress}
          pressRetentionOffset={{ top: 10, left: 10, right: 10, bottom: 10 }}
          unstable_pressDelay={80}
          delayLongPress={300}
          onLongPress={handleLongPress}
          onPressIn={pressAnim.onPressIn}
          onPressOut={pressAnim.onPressOut}
          style={StyleSheet.absoluteFillObject}
          testID={`line-card-${line.id}`}
        >
          <View
            style={[
              isSlim ? styles.cardContentSingleRow : styles.cardContentDoubleRow,
              { paddingLeft: cardPaddingLeft },
              mode === 'select' && selected && { paddingRight: 40 },
            ]}
          >
            <Text
              style={[styles.lineName, { fontSize: lineNameFontSize, fontFamily: lineNameFontFamily }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {line.name}
            </Text>

            {isSlim ? (
              <>
                <View style={styles.flexSpacer} />
                <View style={[styles.statusSubRowSingleRow, mode === 'select' && selected && { marginRight: 32 }]}>
                  {statusType === 'loading' ? (
                    <StatusSkeleton />
                  ) : (
                    <Animated.View style={[styles.statusRowLayout, animatedStatusStyle]}>
                      {mode === 'display' ? (
                        <>
                          <Text style={[styles.statusText, { fontSize: statusTextFontSize, color: statusTextColor, marginRight: 8 }]} numberOfLines={1}>
                            {STATUS_SHORT[statusLabel] || statusLabel}
                          </Text>
                          <StatusBezel statusType={statusType} />
                        </>
                      ) : (
                        <StatusBezel statusType={statusType} />
                      )}
                    </Animated.View>
                  )}
                </View>
              </>
            ) : (
              <View style={styles.statusSubRow}>
                {statusType === 'loading' ? (
                  <StatusSkeleton />
                ) : (
                  <Animated.View style={[styles.statusRowLayout, animatedStatusStyle]}>
                    <StatusBezel statusType={statusType} />
                    <Text style={[styles.statusText, { fontSize: statusTextFontSize, color: statusTextColor }]} numberOfLines={1}>
                      {STATUS_SHORT[statusLabel] || statusLabel}
                    </Text>
                  </Animated.View>
                )}
              </View>
            )}
          </View>
        </Pressable>

        {/* Selection Badge (select mode only) */}
        {mode === 'select' && selected && (
          <Animated.View
            entering={FadeIn.duration(150)}
            exiting={FadeOut.duration(100)}
            style={styles.rightBadgeContainer}
            pointerEvents="none"
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
    </Animated.View>
  );
});

LineCard.displayName = 'LineCard';

const styles = StyleSheet.create({
  outerCard: {
    flex: 1,
    borderRadius: 16,
    position: 'relative',
  },
  cardInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  accentBar: {
    position: 'absolute',
    left: 14,
    width: 3,
    borderRadius: 2,
  },
  cardContentSingleRow: {
    flex: 1,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 30,
    paddingRight: 16,
  },
  cardContentDoubleRow: {
    flex: 1,
    height: '100%',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingRight: 16,
  },
  flexSpacer: {
    flex: 1,
  },
  statusSubRowSingleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lineName: {
    fontSize: 13,
    fontFamily: 'SpaceGrotesk_600SemiBold',
    color: 'rgba(255, 255, 255, 0.95)',
  },
  statusSubRow: {
    marginTop: 4,
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
  },
  rightBadgeContainer: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
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
  },
});
