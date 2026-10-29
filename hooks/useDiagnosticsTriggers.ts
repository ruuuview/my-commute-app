import { useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import { useDiagnosticsStore } from '../store/diagnosticsStore';

/**
 * Dev-only global triggers that open the Diagnostics & Sensors drawer.
 *
 * 1. PHYSICAL SHAKE via expo-sensors Accelerometer.
 *    The native module only exists once a dev client is built AFTER
 *    expo-sensors was added to package.json. Until that rebuild, the
 *    safe-require below throws and shake silently stays off — the
 *    3-finger long-press in _layout.tsx remains the entry gesture.
 *
 * 2. Native Expo dev menu item ("Open Diagnostics & Sensors") so the
 *    drawer is one tap away whenever the native dev menu does open.
 *
 * Hermetic invariant: this path must never read live line data.
 */
const SHAKE_THRESHOLD_G = 1.9;
const TRIGGER_DEBOUNCE_MS = 1500;

export function useDiagnosticsTriggers() {
  useEffect(() => {
    if (!__DEV__) return;

    let subscription: { remove: () => void } | null = null;
    let lastFireAt = 0;

    const fire = () => {
      const now = Date.now();
      if (now - lastFireAt < TRIGGER_DEBOUNCE_MS) return;
      lastFireAt = now;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      useDiagnosticsStore.getState().open();
    };

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const devMenu = require('expo-dev-menu');
      if (devMenu && typeof devMenu.registerDevMenuItems === 'function') {
        void devMenu
          .registerDevMenuItems([
            {
              name: 'Open Diagnostics & Sensors',
              shouldCollapse: true,
              callback: fire,
            },
          ])
          .catch(() => {});
      }
    } catch {
      // expo-dev-menu unavailable in this binary — non-fatal.
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sensors = require('expo-sensors');
      const Accelerometer = sensors?.Accelerometer;
      if (Accelerometer && typeof Accelerometer.addListener === 'function') {
        Accelerometer.setUpdateInterval(100);
        subscription = Accelerometer.addListener(
          ({ x, y, z }: { x: number; y: number; z: number }) => {
            const gForce = Math.sqrt(x * x + y * y + z * z);
            if (gForce > SHAKE_THRESHOLD_G) fire();
          }
        );
      }
    } catch {
      // expo-sensors native module not in this dev build yet — shake
      // activates automatically after the next dev client rebuild.
    }

    return () => {
      subscription?.remove();
    };
  }, []);
}
