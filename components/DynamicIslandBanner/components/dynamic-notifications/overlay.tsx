// Vendored from rit3zh/expo-dynamic-notifications @ 5de059a (MIT License). Imports rewritten from @/ alias to relative paths.
import { useDynamicNotifications } from '../../hooks/use-dynamic-notifications';
import type { INotificationOverlay } from '../../interfaces/notification-overlay.interface';
import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Content } from "./content";
import { Gooey } from "./gooey";

const Overlay: React.FC<INotificationOverlay> &
  React.FunctionComponent<INotificationOverlay> = memo<INotificationOverlay>(
  ({
    style,
  }: INotificationOverlay):
    | (React.ReactNode & React.ReactElement & React.JSX.Element)
    | null => {
    const { layout, reduceMotion, isVisible, notification } = useDynamicNotifications();

    if (!isVisible && !notification) {
      return null;
    }

    return (
      <View
        pointerEvents="box-none"
        style={[styles.overlay, { height: layout.canvasHeight }, style]}
      >
        {!reduceMotion && <Gooey />}
        <Content />
      </View>
    );
  },
);
Overlay.displayName = 'Overlay';

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
});

export { Overlay };

