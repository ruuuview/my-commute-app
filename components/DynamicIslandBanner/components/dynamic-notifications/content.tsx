import React, { memo, useState } from "react";
import { StyleSheet } from "react-native";
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedReaction, runOnJS } from "react-native-reanimated";

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
      geometry,
      notification,
      isVisible,
      reveal,
      dragY,
      dismiss,
      pause,
      resume,
      islandColor,
      reduceMotion,
    } = useDynamicNotifications();

    const [interactive, setInteractive] = useState(false);

    useAnimatedReaction(
      () => (reveal ? reveal.value > 0.6 : false),
      (val, prev) => {
        'worklet';
        if (val !== prev) {
          runOnJS(setInteractive)(val);
        }
      },
      [],
    );

    const s = useNotificationContentStyle({
      geometry,
      reveal,
      offset: dragY,
      layout,
      reduceMotion,
    });

    const gesture = useDismissGesture({
      offset: dragY,
      onDismiss: dismiss,
      onPress: notification?.onPress,
      onPause: pause,
      onResume: resume,
    });

    if (!notification) {
      return null;
    }

    const accessibilityLabel = `${notification.title}${
      notification.message ? `. ${notification.message}` : ''
    }`;

    return (
      <GestureDetector gesture={gesture}>
        <Animated.View
          accessible
          accessibilityRole="alert"
          accessibilityLabel={accessibilityLabel}
          pointerEvents={interactive && isVisible ? 'auto' : 'none'}
          accessibilityActions={[{ name: 'escape', label: 'Dismiss notification' }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'escape') {
              dismiss();
            }
          }}
          style={[
            styles.box,
            {
              top: layout.cardTop,
              left: layout.cardLeft,
              width: layout.cardWidth,
              height: layout.cardHeight,
            },
            s.card,
            style,
          ]}
        >
          {/* Layer 1: Hardware-matched morphing glass surface */}
          <Animated.View
            style={[
              styles.surface,
              { width: layout.cardWidth, height: layout.cardHeight },
              s.surface,
            ]}
          >
            <BlurView
              intensity={GLASS.blurIntensity}
              tint={GLASS.blurTint}
              style={[
                StyleSheet.absoluteFillObject,
                { width: layout.cardWidth, height: layout.cardHeight },
              ]}
              pointerEvents="none"
            />
            <LinearGradient
              colors={[GLASS.specularStart, GLASS.specularEnd]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.sheen}
              pointerEvents="none"
            />
            <Animated.View
              style={[
                StyleSheet.absoluteFillObject,
                { backgroundColor: islandColor },
                s.ink,
              ]}
              pointerEvents="none"
            />
          </Animated.View>

          {/* Layer 2: Gated body with content and rainbow specular caustic rim */}
          <Animated.View
            style={[
              StyleSheet.absoluteFillObject,
              { width: layout.cardWidth, height: layout.cardHeight },
              s.body,
            ]}
          >
            {notification.render ? (
              notification.render(notification)
            ) : (
              <NotificationBody notification={notification} />
            )}
            <LiquidGlassRim
              width={layout.cardWidth}
              height={layout.cardHeight}
              radius={layout.cardRadius}
              reveal={reveal}
            />
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    );
  },
);
Content.displayName = 'Content';

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    backgroundColor: 'transparent',
  },
  surface: {
    position: 'absolute',
    overflow: 'hidden',
    borderCurve: 'continuous',
    borderWidth: GLASS.borderWidth,
    borderColor: GLASS.borderColor,
    borderTopColor: GLASS.borderTop,
    borderBottomColor: GLASS.borderBottom,
    backgroundColor: GLASS.background,
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 24,
  },
});

export { Content };


