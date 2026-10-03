import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";

import { GLASS } from '../../../../theme/colors';
import { NotificationBody } from '../ui/notification-body';
import { useDismissGesture } from '../../hooks/use-dismiss-gesture';
import { useDynamicNotifications } from '../../hooks/use-dynamic-notifications';
import { useNotificationContentStyle } from '../../hooks/use-notification-content-style';
import type { INotificationContent } from '../../interfaces/notification-content.interface';
import { LiquidGlassRim } from '../../../LiquidGlassRim';

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
          accessibilityRole="alert"
          accessibilityActions={[{ name: 'escape', label: 'Dismiss notification' }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'escape') {
              dismiss();
            }
          }}
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
          {/* Layer 1: Hardware Native Optical Frosted Blur (Pure background refraction like Manage Stations drawer) */}
          <BlurView
            intensity={GLASS.blurIntensity}
            tint={GLASS.blurTint}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />

          {/* Layer 2: Subtle Ambient Translucent Wash */}
          <View
            style={[
              StyleSheet.absoluteFillObject,
              {
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                borderRadius: layout.cardRadius,
              },
            ]}
            pointerEvents="none"
          />

          {/* Layer 3: Physical Specular Top Sheen */}
          <LinearGradient
            colors={[GLASS.specularStart, GLASS.specularEnd]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 24,
              borderTopLeftRadius: layout.cardRadius,
              borderTopRightRadius: layout.cardRadius,
            }}
            pointerEvents="none"
          />

          {/* Layer 4: Apple Liquid Glass Bezel Border Overlay */}
          <View
            style={[
              StyleSheet.absoluteFillObject,
              {
                borderRadius: layout.cardRadius,
                borderWidth: GLASS.borderWidth,
                borderColor: GLASS.borderColor,
                borderTopColor: GLASS.borderTop,
                borderBottomColor: GLASS.borderBottom,
              },
            ]}
            pointerEvents="none"
          />

          {/* Layer 5: Pill Alert Content */}
          {notification.render ? (
            notification.render(notification)
          ) : (
            <NotificationBody notification={notification} />
          )}

          {/* Layer 6: Skia Chromatic Moving Caustic Rim */}
          <LiquidGlassRim
            width={layout.cardWidth}
            height={layout.cardHeight}
            radius={layout.cardRadius}
            reveal={reveal}
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
    justifyContent: "center",
    backgroundColor: "transparent",
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.20,
    shadowRadius: 18,
    elevation: 8,
  },
});

export { Content };
