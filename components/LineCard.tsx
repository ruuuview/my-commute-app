import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
  withRepeat,
  withTiming,
  FadeIn,
  FadeOut,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';
import { usePressAnimation } from '../hooks/usePressAnimation';
import { useJiggle } from '../hooks/useJiggle';
import * as Haptics from 'expo-haptics';
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
    status?: string;
    reason?: string;
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
  isEditing?: boolean;
  onDelete?: (id: string) => void;
  drag?: () => void;
  isActive?: boolean;
  index?: number;
}

export function LineCard({
  line,
  selected,
  onPress,
  onLongPress,
  disabled = false,
  statusType,
  statusLabel,
  cardHeight = ONBOARDING_CARD_HEIGHT,
  mode = 'select',
  isEditing = false,
  onDelete,
  drag,
  isActive = false,
  index = 0,
}: LineCardProps) {
  const isSlim = cardHeight <= 40;
  const cardRadius = isSlim ? 16 : 18;
  const lineNameFontSize = isSlim ? 13 : 14;
  const lineNameFontFamily = isSlim ? 'SpaceGrotesk_600SemiBold' : 'SpaceGrotesk_700Bold';
  const statusTextFontSize = isSlim ? 11 : 12;
  const leftAccentBarPosition = isSlim ? 14 : 16;
  const cardPaddingLeft = isSlim ? 30 : 34;

  const opacityVal = useSharedValue(0);
  const jiggleStyle = useJiggle(index, isEditing, isActive);
  const [touchReady, setTouchReady] = useState(true);

  useEffect(() => {
    if (!isEditing) {
      setTouchReady(false);
      const t = setTimeout(() => setTouchReady(true), 150);
      return () => clearTimeout(t);
    }
  }, [isEditing]);

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

  const selectedBorderStyle = {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  };

  const configKey = selected ? 'line_deselect' : 'line_select';
  const pressAnim = usePressAnimation(configKey, disabled);

  const combinedStyle = useAnimatedStyle(() => {
    const scale = pressAnim.animatedStyle.transform?.[0]?.scale ?? 1;
    return {
      transform: [{ scale }],
    };
  });

  const handlePress = () => {
    if (disabled) return;
    if (isEditing || !touchReady) return;

    if (mode === 'select') {
      if (selected) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }

      if (onPress) onPress();
    } else {
      if (onPress) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        onPress();
      }
    }
  };

  // FIX 2: handleLongPress flattened — dashboard owns all routing logic.
  // Previously this had its own isEditing check duplicating the dashboard's
  // mode-aware onLongPress prop, creating a double-routing risk where stale
  // closure values could fire the wrong branch. Now LineCard is a dumb
  // passthrough: whatever the dashboard wired into onLongPress, just call it.
  const handleLongPress = () => {
    if (disabled) return;
    if (onLongPress) onLongPress();
  };

  // Resolve status text colors
  let statusTextColor = 'rgba(255, 255, 255, 0.55)';
  if (statusType === 'good') statusTextColor = '#30D158';
  else if (statusType === 'minor') statusTextColor = '#FF9F0A';
  else if (statusType === 'severe' || statusType === 'suspended' || statusType === 'closure' || statusType === 'error') {
    statusTextColor = '#FF3B30';
  }

  return (
    <Animated.View
      style={[
        styles.outerCard,
        { height: cardHeight, borderRadius: cardRadius, zIndex: 1 },
        mode === 'display' && { marginBottom: 12 },
        isEditing && jiggleStyle
      ]}
    >
      <Animated.View
        style={[
          styles.cardInner,
          { borderRadius: cardRadius },
          selectedBorderStyle,
          combinedStyle,
        ]}
      >
        <BlurView
          intensity={45}
          tint="dark"
          style={StyleSheet.absoluteFillObject}
        />

        {/* Selected state overlay (select mode only) */}
        {mode === 'select' && selected && (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: withAlpha(line.color, '1A') }]} />
        )}

        {/* Left vertical accent bar */}
        <View
          style={[
            styles.accentBar,
            {
              backgroundColor: line.color,
              left: leftAccentBarPosition,
              height: isSlim ? 20 : 36,
              top: (cardHeight - (isSlim ? 20 : 36)) / 2,
            },
          ]}
        />

        {/* Interactive pressing body */}
        <Pressable
          onPress={handlePress}
          onLongPress={handleLongPress}
          onPressIn={pressAnim.onPressIn}
          onPressOut={pressAnim.onPressOut}
          style={StyleSheet.absoluteFillObject}
        >
          <View
            style={[
              isSlim ? styles.cardContentSingleRow : styles.cardContentDoubleRow,
              { paddingLeft: cardPaddingLeft },
              mode === 'select' && selected && { paddingRight: 40 }
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
                        <>
                          <StatusBezel statusType={statusType} />
                          <Text style={[styles.statusText, { fontSize: statusTextFontSize, color: statusTextColor }]} numberOfLines={1}>
                            {STATUS_SHORT[statusLabel] || statusLabel}
                          </Text>
                        </>
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
        {mode === 'select' && selected && !isEditing && (
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

      {/* Delete badge (edit mode only) */}
      {isEditing && onDelete && (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(100)}
          style={styles.deleteBadgeContainer}
        >
          <Animated.View entering={ZoomIn.duration(200).springify()} exiting={ZoomOut.duration(100)}>
            <Pressable
              style={styles.deleteBadge}
              hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onDelete(line.id);
              }}
            >
              <Text style={styles.deleteIcon}>−</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outerCard: {
    flex: 1,
    borderRadius: 16,
    position: 'relative',
    overflow: 'visible',
  },
  cardInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
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
    shadowColor: 'rgba(0,0,0,0.12)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 3,
  },
  deleteBadgeContainer: {
    position: 'absolute',
    top: -6,
    right: -6,
    zIndex: 10,
  },
  deleteBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#1E1E1E',
  },
  deleteIcon: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: -2,
  },
});
