// Vendored from rit3zh/expo-dynamic-notifications @ 5de059a (MIT License). Imports rewritten from @/ alias to relative paths.
import type { SharedValue } from "react-native-reanimated";
import type { IDynamicNotification } from "./dynamic-notification.interface";

interface INotificationTimeline {
  drop: SharedValue<number>;
  expand: SharedValue<number>;
  reveal: SharedValue<number>;
  tint: SharedValue<number>;
  dragY: SharedValue<number>;
  notification: IDynamicNotification | null;
  isVisible: boolean;
  trigger: (notification: IDynamicNotification) => void;
  dismiss: () => void;
  dismissAll: () => void;
  pause: () => void;
  resume: () => void;
}

interface INotificationTimelineOptions {
  onDismiss?: (notification: IDynamicNotification) => void;
  duration?: number | null;
  reduceMotion?: boolean;
}

export type { INotificationTimeline, INotificationTimelineOptions };

