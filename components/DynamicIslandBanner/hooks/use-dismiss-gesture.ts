// Vendored from rit3zh/expo-dynamic-notifications @ 5de059a (MIT License). Imports rewritten from @/ alias to relative paths.
import { DRAG_SPRING } from '../conf/springs';
import {
  SWIPE_DISTANCE,
  SWIPE_VELOCITY,
} from '../constants/notification.consts';
import { clamp } from '../logic/clamp.default';
import { useMemo } from "react";
import { Gesture } from "react-native-gesture-handler";
import type { SharedValue } from "react-native-reanimated";
import { withSpring, runOnJS } from "react-native-reanimated";

interface IUseDismissGesture {
  offset: SharedValue<number>;
  onDismiss: () => void;
  onPress?: () => void;
  onPause?: () => void;
  onResume?: () => void;
}

const useDismissGesture = ({
  offset,
  onDismiss,
  onPress,
  onPause,
  onResume,
}: IUseDismissGesture) => {
  return useMemo(() => {
    const pan = Gesture.Pan()
      .onBegin(() => {
        if (onPause) {
          runOnJS(onPause)();
        }
      })
      .onChange((event) => {
        offset.value = clamp(offset.value + event.changeY, -120, 24);
      })
      .onEnd((event) => {
        const thrown =
          offset.value < SWIPE_DISTANCE || event.velocityY < SWIPE_VELOCITY;

        if (thrown) {
          runOnJS(onDismiss)();
          return;
        }

        offset.value = withSpring(0, DRAG_SPRING);
      })
      .onFinalize(() => {
        if (onResume) {
          runOnJS(onResume)();
        }
      });

    const tap = Gesture.Tap().onEnd((_event, success) => {
      if (!success) {
        return;
      }

      if (onPress) {
        runOnJS(onPress)();
      }

      runOnJS(onDismiss)();
    });

    return Gesture.Exclusive(pan, tap);
  }, [offset, onDismiss, onPress, onPause, onResume]);
};

export { useDismissGesture };
export type { IUseDismissGesture };

