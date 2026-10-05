// Vendored from rit3zh/expo-dynamic-notifications @ 5de059a (MIT License). Imports rewritten from @/ alias to relative paths.
import type { DerivedValue, SharedValue } from "react-native-reanimated";
import type { IDynamicNotification } from "./dynamic-notification.interface";
import type { INotificationGeometry } from "./notification-geometry.interface";
import type { INotificationLayout } from "./notification-layout.interface";

interface IDynamicNotificationsTheme {
  islandColor: string;
  cardColor: string;
  shadowColor: string;
  accent: string;
  blur: number;
  gain: number;
  threshold: number;
}

interface IDynamicNotificationsContext extends IDynamicNotificationsTheme {
  trigger: (notification: IDynamicNotification) => void;
  dismiss: () => void;
  dismissAll: () => void;
  pause: () => void;
  resume: () => void;
  isVisible: boolean;
  notification: IDynamicNotification | null;
  layout: INotificationLayout;
  geometry: DerivedValue<INotificationGeometry>;
  drop: SharedValue<number>;
  expand: SharedValue<number>;
  reveal: SharedValue<number>;
  tint: SharedValue<number>;
  dragY: SharedValue<number>;
  reduceMotion: boolean;
}

export type { IDynamicNotificationsContext, IDynamicNotificationsTheme };

