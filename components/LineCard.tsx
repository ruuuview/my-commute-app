import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
  withRepeat,
  withTiming,
  withSpring,
  FadeIn,
  FadeOut,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';
import { usePressAnimation } from '../hooks/usePressAnimation';
import { useJiggle } from '../hooks/useJiggle';
import * as Haptics from 'expo-haptics';
import { playSound } from '../utils/sound';
import { STATUS_SHORT } from '../constants/statusLabels';
import { ONBOARDING_CARD_HEIGHT } from '../constants/layout';
import { BlurView } from 'expo-blur';
import { StatusBezel } from './StatusBezel';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const PERSONALITY_POOL = [
  "Don't jinx it.",
  "Nothing to see here. Genuinely. Go enjoy that.",
  "All quiet. Suspiciously quiet.",
  "I've got nothing. Which is the whole point.",
  "Boring is the best thing I can be right now.",
  "Enjoy the smooth journey ahead.",
];

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
  const [isExpanded, setIsExpanded] = useState(false);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);

  const isSlim = cardHeight <= 40;
  const cardRadius = isSlim ? 16 : 18;
  const lineNameFontSize = isSlim ? 13 : 14;
  const lineNameFontFamily = isSlim ? 'SpaceGrotesk_600SemiBold' : 'SpaceGrotesk_700Bold';
  const statusTextFontSize = isSlim ? 11 : 12;
  const leftAccentBarPosition = isSlim ? 14 : 16;
  const cardPaddingLeft = isSlim ? 30 : 34;

  const opacityVal = useSharedValue(0);
  const animatedHeight = useSharedValue(cardHeight);

  const jiggleStyle = useJiggle(index, isEditing, isActive);

  useEffect(() => {
    if (isEditing) {
      setIsExpanded(false);
    }
  }, [isEditing]);

  useEffect(() => {
    if (statusType !== 'loading') {
      opacityVal.value = withTiming(1, { duration: 200 });
    } else {
      opacityVal.value = 0;
    }
  }, [statusType, opacityVal]);

  useEffect(() => {
    if (isExpanded && measuredHeight) {
      animatedHeight.value = withSpring(measuredHeight, { damping: 15, stiffness: 120 });
    } else {
      animatedHeight.value = withSpring(cardHeight, { damping: 15, stiffness: 120 });
    }
  }, [isExpanded, measuredHeight, cardHeight, animatedHeight]);

  const animatedStatusStyle = useAnimatedStyle(() => ({
    opacity: opacityVal.value,
  }));

  const animatedContainerStyle = useAnimatedStyle(() => ({
    height: animatedHeight.value,
  }));

  const animatedBarStyle = useAnimatedStyle(() => {
    const h = animatedHeight.value;
    const minH = cardHeight;
    const maxH = measuredHeight || cardHeight;
    const range = maxH - minH;
    const factor = range > 0 ? Math.max(0, Math.min(1, (h - minH) / range)) : 0;

    const collapsedHeight = 20;
    const expandedHeight = Math.max(8, h - 28);
    const heightVal = collapsedHeight + (expandedHeight - collapsedHeight) * factor;

    const collapsedTop = (h - collapsedHeight) / 2;
    const expandedTop = 14;
    const topVal = collapsedTop + (expandedTop - collapsedTop) * factor;

    // Fade out absolute accent bar as we expand
    const opacityVal = 1 - factor;

    return {
      height: heightVal,
      top: topVal,
      opacity: opacityVal,
    };
  });

  const selectedBorderStyle = isExpanded
    ? {
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
      }
    : {
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255, 255, 255, 0.18)',
      };

  const configKey = selected ? 'line_deselect' : 'line_select';
  const pressAnim = usePressAnimation(configKey, disabled);

  const combinedStyle = useAnimatedStyle(() => {
    const scale = isExpanded ? 1 : (pressAnim.animatedStyle.transform?.[0]?.scale ?? 1);
    return {
      transform: [{ scale }],
    };
  });

  const expandCard = () => {
    if (disabled || isEditing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    playSound('select', 0.45);
    setIsExpanded(true);
  };

  const collapseCard = () => {
    setIsExpanded(false);
  };

  const handlePress = () => {
    console.log(`[DEBUG-LineCard] handlePress called. mode=${mode}, line=${line?.name}, disabled=${disabled}, isEditing=${isEditing}`);
    if (disabled) return;
    if (isEditing) return;

    if (isExpanded) {
      collapseCard();
      return;
    }

    if (mode === 'select') {
      const timestamp = Date.now();
      console.log(`[AUDIO_TRIGGER] playSound at ${timestamp} (selected: ${selected})`);

      if (selected) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        playSound('deselect', 0.35);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        playSound('select', 0.45);
      }

      if (onPress) onPress();
    } else {
      // Trigger haptics & audio feedback for card tap on dashboard as per press animation guidelines
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      playSound('select', 0.45);

      if (onPress) {
        console.log(`[DEBUG-LineCard] Invoking onPress callback for ${line?.name}`);
        onPress();
      } else {
        // In display mode, single tap also triggers the in-place portal
        expandCard();
      }
    }
  };

  const handleLongPress = () => {
    if (disabled) return;
    if (isEditing) {
      if (drag) drag();
    } else {
      if (onLongPress) {
        onLongPress();
      } else {
        expandCard();
      }
    }
  };

  // Resolve status text colors
  let statusTextColor = 'rgba(255, 255, 255, 0.55)';
  if (statusType === 'good') statusTextColor = '#30D158';
  else if (statusType === 'minor') statusTextColor = '#FF9F0A';
  else if (statusType === 'severe' || statusType === 'suspended' || statusType === 'closure' || statusType === 'error') {
    statusTextColor = '#FF3B30';
  }



  const reasonText = useMemo(() => {
    if (statusType === 'good') {
      const seed = line.id.charCodeAt(0) + line.id.charCodeAt(line.id.length - 1);
      const idx = seed % PERSONALITY_POOL.length;
      return PERSONALITY_POOL[idx];
    }
    return line.reason || line.status || statusLabel || 'Service is disrupted.';
  }, [statusType, line.id, line.reason, line.status, statusLabel]);

  const renderExpandedContent = () => {
    // Resolve status text and pill background colors
    let statusTextColor = 'rgba(255, 255, 255, 0.55)';
    if (statusType === 'good') statusTextColor = '#30D158';
    else if (statusType === 'minor') statusTextColor = '#FF9F0A';
    else if (statusType === 'severe' || statusType === 'suspended' || statusType === 'closure' || statusType === 'error') {
      statusTextColor = '#FF3B30';
    }

    let statusPillBg = 'rgba(255, 255, 255, 0.06)';
    if (statusType === 'good') {
      statusPillBg = 'rgba(48, 209, 88, 0.2)';
    } else if (statusType === 'minor') {
      statusPillBg = 'rgba(218, 165, 32, 0.2)';
    } else if (statusType === 'severe' || statusType === 'suspended' || statusType === 'closure') {
      statusPillBg = 'rgba(255, 59, 48, 0.2)';
    }

    return (
      <View style={styles.expandedContent}>
        {/* SECTION 1: THE HERO HEADER */}
        <View style={styles.expandedHeader}>
          <View style={[styles.headerColorBar, { backgroundColor: line.color }]} />
          <Text style={styles.expandedLineName}>{line.name.toUpperCase()} LINE</Text>
        </View>

        {/* SECTION 2: THE STATUS LAYER */}
        <View style={styles.statusPillRow}>
          <View style={[styles.statusPill, { backgroundColor: statusPillBg }]}>
            <Text style={[styles.statusPillText, { color: statusTextColor }]}>
              {statusLabel.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* SECTION 3: THE CONTEXTUAL BODY */}
        <Text style={styles.reasonText}>{reasonText}</Text>
      </View>
    );
  };

  return (
    <View
      style={[
        styles.outerCard,
        { height: cardHeight, borderRadius: cardRadius, zIndex: isExpanded ? 9999 : 1, overflow: 'visible' },
        mode === 'display' && { marginBottom: 12 },
        isEditing && jiggleStyle
      ]}
    >
      {/* Absolute dimming backdrop overlay */}
      {isExpanded && (
        <Pressable
          style={styles.backdrop}
          onPress={collapseCard}
        />
      )}

      {/* Morphing inner container */}
      <Animated.View
        style={[
          styles.cardInner,
          { borderRadius: cardRadius },
          selectedBorderStyle,
          animatedContainerStyle,
          combinedStyle,
          isExpanded && styles.expandedShadow,
          isExpanded && { flexDirection: 'column', alignItems: 'stretch' }
        ]}
      >
        <BlurView
          intensity={isExpanded ? 40 : 45}
          tint="dark"
          style={StyleSheet.absoluteFillObject}
        />

        {/* Selected state overlay (select mode only) */}
        {mode === 'select' && selected && (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: withAlpha(line.color, '1A') }]} />
        )}

        {/* Morphing left vertical accent bar */}
        <Animated.View
          style={[
            styles.accentBar,
            { backgroundColor: line.color, left: leftAccentBarPosition },
            animatedBarStyle
          ]}
        />

        {/* Interactive pressing body */}
        <Pressable
          onPress={handlePress}
          onLongPress={handleLongPress}
          onPressIn={pressAnim.onPressIn}
          onPressOut={pressAnim.onPressOut}
          delayLongPress={300}
          style={StyleSheet.absoluteFillObject}
        >
          {isExpanded ? (
            renderExpandedContent()
          ) : (
            <View style={[styles.cardContentSingleRow, { paddingLeft: cardPaddingLeft }]}>
              <Text
                style={[styles.lineName, { fontSize: lineNameFontSize, fontFamily: lineNameFontFamily }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {line.name}
              </Text>

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

            </View>
          )}
        </Pressable>

        {/* Selection Badge (select mode only) */}
        {mode === 'select' && selected && !isEditing && !isExpanded && (
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

        {/* Delete badge (edit mode only) */}
        {!isExpanded && isEditing && onDelete && (
          <Animated.View style={styles.deleteBadgeContainer}>
            <Pressable
              style={styles.deleteBadge}
              hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onDelete(line.id);
              }}
            >
              <Text style={styles.deleteIcon}>−</Text>
            </Pressable>
          </Animated.View>
        )}
      </Animated.View>

      {/* Invisible Measure View (rendered in-place to resolve height string dynamically) */}
      <View
        style={[
          styles.measureContainer,
          { borderRadius: cardRadius }
        ]}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0) {
            setMeasuredHeight(h);
          }
        }}
        pointerEvents="none"
      >
        {renderExpandedContent()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerCard: {
    flex: 1,
    borderRadius: 16,
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
  expandedShadow: {
    elevation: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
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
  backdrop: {
    position: 'absolute',
    top: -SCREEN_HEIGHT,
    bottom: -SCREEN_HEIGHT,
    left: -SCREEN_WIDTH,
    right: -SCREEN_WIDTH,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    zIndex: 9998,
  },
  expandedContent: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    justifyContent: 'flex-start',
    width: '100%',
  },
  expandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 12,
    width: '100%',
  },
  headerColorBar: {
    width: 4,
    height: 18,
    borderRadius: 2,
    marginRight: 10,
  },
  expandedLineName: {
    fontSize: 15,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  statusPillRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 12,
  },
  statusPill: {
    borderRadius: 9999,
    paddingVertical: 6,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPillText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  reasonText: {
    fontSize: 14,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: 22,
    textAlign: 'left',
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
  measureContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    opacity: 0,
    pointerEvents: 'none',
    height: undefined,
  },
});
