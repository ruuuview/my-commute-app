// Vendored from rit3zh/expo-dynamic-notifications @ 5de059a (MIT License). Imports rewritten from @/ alias to relative paths.
import { PALETTE } from '../../conf/palette';
import {
  CARD_HEIGHT,
  CARD_RADIUS,
  GOO_BLUR_MAX,
  GOO_BLUR_MIN,
  GOO_GAIN,
  GOO_STRENGTH,
  GOO_THRESHOLD,
} from '../../constants/notification.consts';
import { DynamicNotificationsContext } from '../../context';
import { buildNotificationGeometry } from '../../core/build-notification-geometry';
import { getNotificationLayout } from '../../helpers';
import { useNotificationTimeline } from '../../hooks/use-notification-timeline';
import type { IDynamicNotifications } from '../../interfaces/dynamic-notifications.interface';
import { clamp } from '../../logic/clamp.default';
import { mix } from '../../logic/mix.default';
import { useLiveReducedMotion } from '../../../../hooks/useReducedMotion';
import { memo, useMemo } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { useDerivedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Overlay } from "./overlay";

const TIER_HEIGHT = { compact: 70, standard: 84, expanded: 96 } as const;
const tierRadius = (h: number): number => 26 + ((h - 70) / 26) * 4;

const Root: React.FC<IDynamicNotifications> &
  React.FunctionComponent<IDynamicNotifications> = memo<IDynamicNotifications>(
  ({
    children,
    strength = GOO_STRENGTH,
    blur,
    gain = GOO_GAIN,
    threshold = GOO_THRESHOLD,
    islandWidth,
    islandHeight,
    islandTop,
    islandColor = PALETTE.island,
    cardWidth,
    cardHeight,
    cardRadius,
    cardColor = PALETTE.card,
    shadowColor = PALETTE.shadow,
    accent = PALETTE.accent,
    gap,
    duration,
    style,
    onDismiss,
  }: IDynamicNotifications):
    | (React.ReactNode & React.ReactElement & React.JSX.Element)
    | null => {
    const { width } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const reduceMotion = useLiveReducedMotion();

    const timeline = useNotificationTimeline({ onDismiss, duration, reduceMotion });

    const activeTier = timeline.notification?.tier;
    const effectiveCardHeight = activeTier
      ? TIER_HEIGHT[activeTier]
      : (cardHeight ?? CARD_HEIGHT);
    const effectiveCardRadius = cardRadius ?? (activeTier ? tierRadius(effectiveCardHeight) : CARD_RADIUS);

    const layout = useMemo(
      () =>
        getNotificationLayout({
          width,
          insetTop: insets.top,
          islandWidth,
          islandHeight,
          islandTop,
          cardWidth,
          cardHeight: effectiveCardHeight,
          cardRadius: effectiveCardRadius,
          gap,
        }),
      [
        width,
        insets.top,
        islandWidth,
        islandHeight,
        islandTop,
        cardWidth,
        effectiveCardHeight,
        effectiveCardRadius,
        gap,
      ],
    );

    const geometry = useDerivedValue(() =>
      buildNotificationGeometry({
        drop: timeline.drop.value,
        expand: timeline.expand.value,
        layout,
      }),
    );

    const radius = useMemo(
      () => blur ?? mix(clamp(strength, 0, 1), GOO_BLUR_MIN, GOO_BLUR_MAX),
      [blur, strength],
    );

    const value = useMemo(
      () => ({
        trigger: timeline.trigger,
        dismiss: timeline.dismiss,
        dismissAll: timeline.dismissAll,
        pause: timeline.pause,
        resume: timeline.resume,
        isVisible: timeline.isVisible,
        notification: timeline.notification,
        drop: timeline.drop,
        expand: timeline.expand,
        reveal: timeline.reveal,
        tint: timeline.tint,
        dragY: timeline.dragY,
        layout,
        geometry,
        reduceMotion,
        islandColor,
        cardColor,
        shadowColor,
        accent,
        blur: radius,
        gain,
        threshold,
      }),
      [
        timeline.trigger,
        timeline.dismiss,
        timeline.dismissAll,
        timeline.pause,
        timeline.resume,
        timeline.isVisible,
        timeline.notification,
        timeline.drop,
        timeline.expand,
        timeline.reveal,
        timeline.tint,
        timeline.dragY,
        layout,
        geometry,
        reduceMotion,
        islandColor,
        cardColor,
        shadowColor,
        accent,
        radius,
        gain,
        threshold,
      ],
    );

    return (
      <DynamicNotificationsContext.Provider value={value}>
        <View style={[styles.root, style]}>
          {children}
          <Overlay />
        </View>
      </DynamicNotificationsContext.Provider>
    );
  },
);
Root.displayName = 'Root';

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

export { Root };

