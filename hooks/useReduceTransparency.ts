// hooks/useReduceTransparency.ts
import { useState, useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Universal hook for iOS Reduce Transparency accessibility setting.
 * When enabled, apps should replace translucent glass and BlurView materials
 * with solid, opaque high-contrast surfaces (e.g. #1C1C1E).
 */
export function useReduceTransparency(): boolean {
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((enabled) => {
        if (mounted) setReduceTransparency(enabled);
      })
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      (enabled) => {
        if (mounted) setReduceTransparency(enabled);
      }
    );

    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduceTransparency;
}

export default useReduceTransparency;
