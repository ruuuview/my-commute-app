// Vendored from rit3zh/expo-dynamic-notifications @ 5de059a (MIT License). Imports rewritten from @/ alias to relative paths.
import { AnimatedBlurView } from '../ui/animated-blur-view';
import { NotificationBody } from '../ui/notification-body';
import { useContentBlur } from '../../hooks/use-content-blur';
import { useDismissGesture } from '../../hooks/use-dismiss-gesture';
import { useDynamicNotifications } from '../../hooks/use-dynamic-notifications';
import { useNotificationContentStyle } from '../../hooks/use-notification-content-style';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useReduceTransparency } from '../../../../hooks/useReduceTransparency';
import type { INotificationContent } from '../../interfaces/notification-content.interface';
import { GLASS } from '../../../../theme/colors';
import React, { memo, useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { SPECULAR_RIM_FADE_IN_MS } from '../../constants/notification.consts';

// Native iOS 18+ Liquid Glass availability (same pattern as FixItSheet).
let isNativeGlassAvailable = false;
try {
  if (Platform.OS === 'ios' && typeof isLiquidGlassAvailable === 'function') {
    isNativeGlassAvailable = isLiquidGlassAvailable();
  }
} catch {
  isNativeGlassAvailable = false;
}

const Content: React.FC<INotificationContent> &
  React.FunctionComponent<INotificationContent> = memo<INotificationContent>(
  ({
    style,
  }: INotificationContent):
    | (React.ReactNode & React.ReactElement & React.JSX.Element)
    | null => {
    const {
      layout,
      notification,
      isVisible,
      drop,
      expand,
      reveal,
      dragY,
      dismiss,
    } = useDynamicNotifications();

    const animated = useNotificationContentStyle({
      drop,
      expand,
      reveal,
      offset: dragY,
      layout,
    });
    const blur = useContentBlur({ reveal });
    const reduceTransparency = useReduceTransparency();
    const rimOpacity = useSharedValue(0);
    useEffect(() => {
      rimOpacity.value = isVisible ? withTiming(1, { duration: SPECULAR_RIM_FADE_IN_MS }) : 0;
    }, [isVisible, rimOpacity]);
    const specularRimStyle = useAnimatedStyle(() => ({ opacity: rimOpacity.value }));
    const gesture = useDismissGesture({
      offset: dragY,
      onDismiss: dismiss,
      onPress: notification?.onPress,
    });

    if (!notification) {
      return null;
    }

    return (
      <GestureDetector gesture={gesture}>
        <Animated.View
          pointerEvents={isVisible ? "auto" : "none"}
          style={[
            styles.content,
            {
              top: layout.cardTop,
              left: layout.cardLeft,
              width: layout.cardWidth,
              height: layout.cardHeight,
              borderRadius: layout.cardRadius,
            },
            animated,
            style,
          ]}
        >
          {/* True dark-glass card — native iOS 18+ Liquid Glass via
              expo-glass-effect (the same GlassView pattern as FixItSheet /
              AlertHoursSheet), falling back to the approved AnimatedBlurView
              with the app's GLASS tokens on older iOS. Solid #1C1C1E when
              Reduce Transparency is on (same as LiquidGlassView). This
              Content view fades in with `reveal` (see
              useNotificationContentStyle), so the glass inherits the
              crossfade for free: as the opaque Skia card fades out, the
              glass fades in at identical geometry. */}
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { borderRadius: layout.cardRadius },
              styles.glass,
              reduceTransparency && { backgroundColor: '#1C1C1E' },
            ]}
          >
            {!reduceTransparency && (
              isNativeGlassAvailable ? (
                <GlassView
                  glassEffectStyle="regular"
                  colorScheme="dark"
                  style={[
                    StyleSheet.absoluteFill,
                    { borderRadius: layout.cardRadius },
                  ]}
                  pointerEvents="none"
                />
              ) : (
                <AnimatedBlurView
                  tint={GLASS.blurTint}
                  intensity={GLASS.blurIntensity}
                  style={[
                    StyleSheet.absoluteFill,
                    { borderRadius: layout.cardRadius },
                    styles.glassBlur,
                  ]}
                />
              )
            )}
            {/* Optical depth tint: dark scrim between the blur and the text.
                The glass base is fully transparent, so over bright
                backgrounds the card washed out completely and the white
                text disappeared. This guarantees contrast on any backdrop. */}
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                {
                  borderRadius: layout.cardRadius,
                  backgroundColor: GLASS.tintOverlay,
                },
              ]}
            />
          </View>

          {/* Apple-style catch-light is independent from the glass/reveal crossfade. */}
          {!reduceTransparency && (
            <Animated.View
              testID="dynamic-island-specular-rim"
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, styles.specularRim, { borderRadius: layout.cardRadius }, specularRimStyle]}
            />
          )}

          {notification.render ? (
            notification.render(notification)
          ) : (
            <NotificationBody notification={notification} />
          )}

          <AnimatedBlurView
            pointerEvents="none"
            tint="dark"
            animatedProps={blur.animatedProps}
            style={[
              StyleSheet.absoluteFill,
              { borderRadius: layout.cardRadius },
              styles.blur,
              blur.animatedStyle,
            ]}
          />
        </Animated.View>
      </GestureDetector>
    );
  },
);
Content.displayName = 'Content';

const styles = StyleSheet.create({
  content: {
    position: "absolute",
    overflow: "hidden",
    borderCurve: "continuous",
  },
  blur: {
    borderCurve: "continuous",
  },
  // Hybrid resting surface: native Liquid Glass (iOS 18+) with the GLASS
  // specular rim as the border language; expo-blur fallback on older iOS;
  // solid #1C1C1E under Reduce Transparency. Replaces the opaque Skia
  // card at reveal = 1.
  glass: {
    backgroundColor: GLASS.background,
    borderWidth: GLASS.borderWidth,
    borderColor: GLASS.borderColor,
    borderTopColor: GLASS.borderTop,
    borderLeftColor: GLASS.borderSides,
    borderRightColor: GLASS.borderSides,
    borderBottomColor: GLASS.borderBottom,
    borderCurve: "continuous",
  },
  glassBlur: {
    borderCurve: "continuous",
  },
  specularRim: {
    borderWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.62)',
    borderLeftColor: 'rgba(255, 255, 255, 0.26)',
    borderRightColor: 'rgba(255, 255, 255, 0.26)',
    borderBottomColor: 'rgba(255, 255, 255, 0.12)',
  },
});

export { Content };
