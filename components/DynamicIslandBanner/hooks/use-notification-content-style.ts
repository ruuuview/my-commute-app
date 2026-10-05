// Vendored from rit3zh/expo-dynamic-notifications @ 5de059a (MIT License). Imports rewritten from @/ alias to relative paths.
import {
  BODY_START,
  GLASS_IN_END,
  GLASS_IN_START,
  INK_CLEAR_END,
  INK_CLEAR_START,
} from '../constants/notification.consts';
import type { INotificationGeometry } from '../interfaces/notification-geometry.interface';
import type { INotificationLayout } from '../interfaces/notification-layout.interface';
import { clamp } from '../logic/clamp.default';
import { ramp } from '../logic/ramp';
import type { DerivedValue, SharedValue } from "react-native-reanimated";
import { useAnimatedStyle } from "react-native-reanimated";

interface IUseNotificationContentStyle {
  geometry: DerivedValue<INotificationGeometry>;
  reveal: SharedValue<number>;
  offset: SharedValue<number>;
  layout: INotificationLayout;
  reduceMotion?: boolean;
}

const useNotificationContentStyle = ({
  geometry,
  reveal,
  offset,
  layout,
  reduceMotion = false,
}: IUseNotificationContentStyle) => {
  const card = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
  }));

  const surface = useAnimatedStyle(() => {
    if (reduceMotion) {
      return {
        opacity: reveal.value,
        left: 0,
        top: 0,
        width: layout.cardWidth,
        height: layout.cardHeight,
        borderRadius: layout.cardRadius,
      };
    }
    const g = geometry.value;
    return {
      opacity: ramp(g.widthRatio, GLASS_IN_START, GLASS_IN_END),
      left: g.x - layout.cardLeft,
      top: g.y - layout.cardTop,
      width: g.width,
      height: g.height,
      borderRadius: g.radius,
    };
  });

  const ink = useAnimatedStyle(() => {
    if (reduceMotion) {
      return { opacity: 0 };
    }
    return {
      opacity: 1 - ramp(geometry.value.widthRatio, INK_CLEAR_START, INK_CLEAR_END),
    };
  });

  const body = useAnimatedStyle(() => {
    if (reduceMotion) {
      return {
        opacity: reveal.value,
        transform: [{ translateY: 0 }],
      };
    }
    return {
      opacity:
        ramp(geometry.value.widthRatio, BODY_START, 1) *
        clamp(reveal.value / 0.5, 0, 1),
      transform: [{ translateY: geometry.value.offsetY }],
    };
  });

  return { card, surface, ink, body };
};

export { useNotificationContentStyle };
export type { IUseNotificationContentStyle };

