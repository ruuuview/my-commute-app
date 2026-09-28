// Vendored from rit3zh/expo-dynamic-notifications @ 5de059a (MIT License). Imports rewritten from @/ alias to relative paths.
import {
  COLLAPSE_SPRING,
  DROP_SPRING,
  EXPAND_SPRING,
  FADE_SPRING,
  RETURN_SPRING,
  REVEAL_SPRING,
  TINT_SPRING,
} from '../conf/springs';
import {
  AUTO_DISMISS,
  ENTER_EXPAND_DELAY,
  ENTER_REVEAL_DELAY,
  ENTER_TINT_DELAY,
  EXIT_COLLAPSE_DELAY,
  EXIT_DROP_DELAY,
} from '../constants/notification.consts';
import type { IDynamicNotification } from '../interfaces/dynamic-notification.interface';
import type {
  INotificationTimeline,
  INotificationTimelineOptions,
} from '../interfaces/notification-timeline.interface';
import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelAnimation,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useLiveReducedMotion } from "../../../hooks/useReducedMotion";

const useNotificationTimeline = ({
  onDismiss,
  duration,
}: INotificationTimelineOptions = {}): INotificationTimeline => {
  const reducedMotion = useLiveReducedMotion();
  const drop = useSharedValue(0);
  const expand = useSharedValue(0);
  const reveal = useSharedValue(0);
  const tint = useSharedValue(1);
  const dragY = useSharedValue(0);

  const [notification, setNotification] = useState<IDynamicNotification | null>(
    null,
  );
  const [isVisible, setIsVisible] = useState(false);
  const [session, setSession] = useState(0);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef<IDynamicNotification | null>(null);
  const queued = useRef<IDynamicNotification | null>(null);
  const exiting = useRef(false);
  const exitRef = useRef<() => void>(() => {});
  const dismissHandler = useRef(onDismiss);

  dismissHandler.current = onDismiss;

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const enter = useCallback(
    (next: IDynamicNotification) => {
      clearTimer();
      current.current = next;
      exiting.current = false;
      setNotification(next);
      setIsVisible(true);
      setSession((value) => value + 1);

      cancelAnimation(drop);
      cancelAnimation(expand);
      cancelAnimation(reveal);
      cancelAnimation(tint);

      drop.value = 0;
      expand.value = 0;
      reveal.value = 0;
      tint.value = 0;
      dragY.value = 0;

      const fallback = duration === undefined ? AUTO_DISMISS : duration;
      const lifetime = next.duration === undefined ? fallback : next.duration;

      if (lifetime !== null) {
        const leadTime = reducedMotion ? 150 : ENTER_REVEAL_DELAY;
        timer.current = setTimeout(
          () => exitRef.current(),
          leadTime + lifetime,
        );
      }
    },
    [clearTimer, dragY, drop, duration, expand, reducedMotion, reveal, tint],
  );

  useEffect(() => {
    if (session === 0) {
      return;
    }

    if (reducedMotion) {
      drop.value = 1;
      tint.value = 1;
      expand.value = 1;
      reveal.value = withTiming(1, { duration: 150 });
      return;
    }

    drop.value = withSpring(1, DROP_SPRING);
    tint.value = withDelay(ENTER_TINT_DELAY, withSpring(1, TINT_SPRING));
    expand.value = withDelay(
      ENTER_EXPAND_DELAY,
      withSpring(1, EXPAND_SPRING),
    );
    reveal.value = withDelay(
      ENTER_REVEAL_DELAY,
      withSpring(1, REVEAL_SPRING),
    );
  }, [session, drop, expand, reveal, tint, reducedMotion]);

  const settle = useCallback(() => {
    const dismissed = current.current;
    const next = queued.current;

    current.current = null;
    queued.current = null;
    exiting.current = false;
    setIsVisible(false);

    if (next) {
      enter(next);
    } else {
      setNotification(null);
    }

    if (dismissed) {
      dismissHandler.current?.(dismissed);
    }
  }, [enter]);

  const exit = useCallback(() => {
    if (!current.current || exiting.current) {
      return;
    }

    exiting.current = true;
    clearTimer();

    if (reducedMotion) {
      reveal.value = withTiming(0, { duration: 150 }, (finished?: boolean) => {
        "worklet";

        if (finished) {
          scheduleOnRN(settle);
        }
      });
      drop.value = 0;
      expand.value = 0;
      tint.value = 0;
      return;
    }

    reveal.value = withSpring(0, FADE_SPRING);
    expand.value = withDelay(
      EXIT_COLLAPSE_DELAY,
      withSpring(0, COLLAPSE_SPRING),
    );

    tint.value = withDelay(EXIT_DROP_DELAY, withSpring(0, RETURN_SPRING));
    drop.value = withDelay(
      EXIT_DROP_DELAY,
      withSpring(0, RETURN_SPRING, (finished?: boolean) => {
        "worklet";

        if (finished) {
          scheduleOnRN(settle);
        }
      }),
    );
  }, [clearTimer, drop, expand, reducedMotion, reveal, settle, tint]);

  exitRef.current = exit;

  const trigger = useCallback(
    (next: IDynamicNotification) => {
      if (current.current) {
        queued.current = next;
        exit();
        return;
      }

      enter(next);
    },
    [enter, exit],
  );

  const dismiss = useCallback(() => {
    queued.current = null;
    exit();
  }, [exit]);

  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  return {
    drop,
    expand,
    reveal,
    tint,
    dragY,
    notification,
    isVisible,
    trigger,
    dismiss,
  };
};

export { useNotificationTimeline };
