// Vendored from rit3zh/expo-dynamic-notifications @ 5de059a (MIT License). Imports rewritten from @/ alias to relative paths.
import type { StyleProp, ViewStyle } from "react-native";
import type { IDynamicNotification } from "./dynamic-notification.interface";

interface INotificationContent {
  style?: StyleProp<ViewStyle>;
}

interface INotificationBody {
  notification: IDynamicNotification;
}

export type { INotificationBody, INotificationContent };
