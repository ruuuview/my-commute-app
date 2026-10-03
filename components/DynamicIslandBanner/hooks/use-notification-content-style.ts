// Vendored from rit3zh/expo-dynamic-notifications @ 5de059a (MIT License). Imports rewritten from @/ alias to relative paths.
import { CONTENT_MIN_SCALE } from '../constants/notification.consts';
import { buildNotificationGeometry } from '../core/build-notification-geometry';
import type { INotificationLayout } from '../interfaces/notification-layout.interface';
import { clamp } from '../logic/clamp.default';
import { mix } from '../logic/mix.default';
import type { SharedValue } from "react-native-reanimated";
import { useAnimatedStyle } from "react-native-reanimated";

interface IUseNotificationContentStyle {
  drop: SharedValue<number>;
  expand: SharedValue<number>;
  reveal: SharedValue<number>;
  offset: SharedValue<number>;
  layout: INotificationLayout;
}

const useNotificationContentStyle = ({
  drop,
  expand,
  reveal,
  offset,
  layout,
}: IUseNotificationContentStyle) => {
  return useAnimatedStyle(() => {
    const geometry = buildNotificationGeometry({
      drop: drop.value,
      expand: expand.value,
      layout,
    });

    const progress = clamp(reveal.value, 0, 1);
    const glassOpacity = Math.min(progress / 0.5, 1);

    const overshoot = clamp(geometry.widthRatio - 1, 0, 0.12);
    const scale = mix(progress, 0.96, 1) + overshoot * progress;

    return {
      opacity: glassOpacity,
      transform: [{ translateY: geometry.offsetY + offset.value }, { scale }],
    };
  });
};

export { useNotificationContentStyle };
export type { IUseNotificationContentStyle };
