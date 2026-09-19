// hooks/useReducedMotion.ts
import { useState, useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

/**
 * Single authoritative source of truth for live reduced-motion preference.
 * Combines Reanimated's launch-time check with AccessibilityInfo's dynamic listener.
 */
export function useLiveReducedMotion(): boolean {
  const initial = useReducedMotion();
  const [live, setLive] = useState<boolean>(Boolean(initial));

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setLive(enabled);
      })
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      if (mounted) setLive(enabled);
    });

    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return live;
}

export default useLiveReducedMotion;
