import React, { memo, useCallback } from 'react';
import { StyleSheet, Pressable, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLiveReducedMotion } from '../hooks/useJiggle';

export const ACTION_WIDTH = 76;
export const OPEN_THRESHOLD = 38;
export const OVERSWIPE_THRESHOLD = 200;

interface AppleSwipeableRowProps {
  children: React.ReactNode;
  onDelete?: () => void;
  cardHeight?: number;
  cardRadius?: number;
  marginBottom?: number;
  disabled?: boolean;
  testID?: string;
}

export const AppleSwipeableRow = memo(function AppleSwipeableRow({
  children,
  onDelete,
  cardHeight,
  cardRadius = 16,
  marginBottom = 8,
  disabled = false,
  testID,
}: AppleSwipeableRowProps) {
  const reducedMotion = useLiveReducedMotion();

  // Horizontal pan offset
  const translateX = useSharedValue(0);
  const isOpen = useSharedValue(false);
  const hasTriggeredOverdragHaptic = useSharedValue(false);

  // Dynamic height measurement & atomic collapse values
  const measuredHeight = useSharedValue(cardHeight ?? 0);
  const isDeleting = useSharedValue(false);
  const rowHeight = useSharedValue(cardHeight ?? 0);
  const rowMarginBottom = useSharedValue(marginBottom);
  const rowOpacity = useSharedValue(1);

  const executeDelete = useCallback(() => {
    if (onDelete) {
      onDelete();
    }
  }, [onDelete]);

  const triggerOverswipeHaptic = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, []);

  const handleDeletePress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});

    if (reducedMotion || process.env.NODE_ENV === 'test') {
      isDeleting.value = true;
      rowHeight.value = 0;
      rowMarginBottom.value = 0;
      rowOpacity.value = 0;
      executeDelete();
      return;
    }

    // Atomic parent height + margin collapse
    isDeleting.value = true;
    const initialH = measuredHeight.value > 0 ? measuredHeight.value : (cardHeight || 46);
    rowHeight.value = initialH;
    rowOpacity.value = withTiming(0, { duration: 180 });
    rowMarginBottom.value = withTiming(0, { duration: 240 });
    rowHeight.value = withTiming(0, { duration: 240 }, (finished) => {
      if (finished) {
        runOnJS(executeDelete)();
      }
    });
  }, [executeDelete, reducedMotion, rowHeight, rowMarginBottom, rowOpacity, measuredHeight, cardHeight, isDeleting]);

  const closeRow = useCallback(() => {
    if (reducedMotion) {
      translateX.value = 0;
    } else {
      translateX.value = withSpring(0, { damping: 24, stiffness: 220 });
    }
    isOpen.value = false;
  }, [reducedMotion, translateX, isOpen]);

  const panGesture = Gesture.Pan()
    .enabled(!disabled)
    .activeOffsetX([-10, 10])
    .failOffsetY([-5, 5])
    .onUpdate((event) => {
      const startOffset = isOpen.value ? -ACTION_WIDTH : 0;
      const rawX = startOffset + event.translationX;

      if (rawX > 0) {
        // Rubber band against right swipe
        translateX.value = rawX * 0.15;
      } else {
        // Free tracking with overdrag haptic tick
        translateX.value = rawX;

        if (rawX <= -OVERSWIPE_THRESHOLD) {
          if (!hasTriggeredOverdragHaptic.value) {
            hasTriggeredOverdragHaptic.value = true;
            runOnJS(triggerOverswipeHaptic)();
          }
        } else {
          if (hasTriggeredOverdragHaptic.value) {
            hasTriggeredOverdragHaptic.value = false;
          }
        }
      }
    })
    .onEnd((event) => {
      const currentX = translateX.value;
      const velocityX = event.velocityX;

      // Deep overswipe past threshold OR fast left flick past action width -> auto-delete
      if (currentX <= -OVERSWIPE_THRESHOLD || (currentX < -ACTION_WIDTH && velocityX < -800)) {
        isOpen.value = false;
        if (reducedMotion || process.env.NODE_ENV === 'test') {
          translateX.value = -400;
          runOnJS(handleDeletePress)();
        } else {
          translateX.value = withTiming(-400, { duration: 180 }, (finished) => {
            if (finished) {
              runOnJS(handleDeletePress)();
            }
          });
        }
      } else if (currentX < -OPEN_THRESHOLD || velocityX < -500) {
        // Half swipe -> snap open to reveal delete pill
        if (reducedMotion) {
          translateX.value = -ACTION_WIDTH;
        } else {
          translateX.value = withSpring(-ACTION_WIDTH, {
            velocity: velocityX,
            damping: 22,
            stiffness: 220,
          });
        }
        isOpen.value = true;
      } else {
        // Snap back shut
        if (reducedMotion) {
          translateX.value = 0;
        } else {
          translateX.value = withSpring(0, {
            velocity: velocityX,
            damping: 24,
            stiffness: 220,
          });
        }
        isOpen.value = false;
      }
    });

  // Card transform (slides left)
  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Right action tray transform & expanding width
  // At translateX = 0, tray translateX = ACTION_WIDTH (100% off-screen / clipped).
  // At translateX = -ACTION_WIDTH, tray translateX = 0 (perfectly in-place).
  // At translateX < -ACTION_WIDTH, tray expands dynamically to fill the exposed gap.
  const trayAnimatedStyle = useAnimatedStyle(() => {
    const currentX = translateX.value;
    const trayWidth = Math.max(ACTION_WIDTH, -currentX);
    const trayOffset = interpolate(
      currentX,
      [-ACTION_WIDTH, 0],
      [0, ACTION_WIDTH],
      Extrapolation.CLAMP
    );
    const trayOpacity = interpolate(
      currentX,
      [-OPEN_THRESHOLD, 0],
      [1, 0],
      Extrapolation.CLAMP
    );

    return {
      width: trayWidth,
      transform: [{ translateX: trayOffset }],
      opacity: trayOpacity,
    };
  });

  // Atomic outer container animated style
  const containerAnimatedStyle = useAnimatedStyle(() => {
    if (isDeleting.value) {
      return {
        height: rowHeight.value,
        marginBottom: rowMarginBottom.value,
        opacity: rowOpacity.value,
      };
    }
    if (cardHeight) {
      return {
        height: cardHeight,
        marginBottom: rowMarginBottom.value,
        opacity: rowOpacity.value,
      };
    }
    return {
      marginBottom: rowMarginBottom.value,
      opacity: rowOpacity.value,
    };
  });

  return (
    <Animated.View
      style={[
        styles.outerContainer,
        { borderRadius: cardRadius },
        containerAnimatedStyle,
      ]}
      testID={testID}
    >
      {/* Right Action Tray (Pinned to right, dynamically expands leftward during overswipe) */}
      <Animated.View
        style={[
          styles.actionTray,
          { borderRadius: cardRadius },
          trayAnimatedStyle,
        ]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={handleDeletePress}
          style={[
            styles.deletePill,
            {
              borderRadius: Math.max(10, cardRadius - 4),
            },
          ]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Delete item"
        >
          <View style={styles.iconContainer}>
            <Ionicons name="trash" size={18} color="#FFFFFF" />
          </View>
        </Pressable>
      </Animated.View>

      {/* Foreground Card Surface */}
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.cardSurface,
            cardHeight ? { height: cardHeight } : undefined,
            cardAnimatedStyle,
          ]}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0) {
              measuredHeight.value = h;
            }
          }}
        >
          <Pressable
            onPress={() => {
              if (isOpen.value) {
                closeRow();
              }
            }}
            style={[styles.fullWidth, cardHeight ? { height: cardHeight } : undefined]}
          >
            {children}
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
});

AppleSwipeableRow.displayName = 'AppleSwipeableRow';

const styles = StyleSheet.create({
  outerContainer: {
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  actionTray: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 4,
    paddingVertical: 2,
    zIndex: 1,
  },
  deletePill: {
    flex: 1,
    width: '100%',
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 20,
  },
  iconContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardSurface: {
    width: '100%',
    zIndex: 2,
  },
  fullWidth: {
    width: '100%',
  },
});
