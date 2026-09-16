import { useState, useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

export interface UseScrollLockOptions {
  onForceReset?: () => void;
}

export function useScrollLock(options?: UseScrollLockOptions) {
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const onForceResetRef = useRef(options?.onForceReset);
  onForceResetRef.current = options?.onForceReset;

  const lockScroll = useCallback(() => {
    setScrollEnabled(false);
  }, []);

  const unlockScroll = useCallback(() => {
    setScrollEnabled(true);
  }, []);

  const forceReset = useCallback(() => {
    setScrollEnabled(true);
    onForceResetRef.current?.();
  }, []);

  // Fail-safe 1: If the app is backgrounded or becomes inactive mid-drag,
  // immediately release the scroll lock and cancel any active edit/drag state.
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        forceReset();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [forceReset]);

  // Fail-safe 2: If the component unmounts for any reason while scroll was locked,
  // unconditionally unlock.
  useEffect(() => {
    return () => {
      setScrollEnabled(true);
    };
  }, []);

  return {
    scrollEnabled,
    setScrollEnabled,
    lockScroll,
    unlockScroll,
    forceReset,
  };
}
