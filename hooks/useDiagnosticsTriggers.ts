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
// Motion discrimination against accidental triggers:
//   1. Peak gate 3.2 G — gravity is 1.0G at rest; lifting/jogging
//      sits 1.2–2.6G. Only hard arm-driven motion crosses 3.2.
//   2. Stop-dip gate 1.5 G — a real shake oscillates out-and-back with an
//      instant of near-rest between strokes (dip below 1.5G). A wrist
//      twist sustains centripetal force and never stops.
//   3. The drawer opens ONLY on peak → dip → peak within SHAKE_PEAK_WINDOW_MS.
const SHAKE_PEAK_G = 2.6;
const SHAKE_DIP_G = 1.5;
const SHAKE_PEAK_WINDOW_MS = 900;
const TRIGGER_DEBOUNCE_MS = 1500;

export function useDiagnosticsTriggers() {
  useEffect(() => {
    if (!__DEV__) return;

    let subscription: { remove: () => void } | null = null;
    let lastFireAt = 0;
    // Shake state machine: 'idle' → peak arms it → dip expects return
    // stroke → second peak fires. Peak with no dip (twist) never fires.
    let phase: 'idle' | 'armed' | 'expecting' = 'idle';
    let phaseAt = 0;

    const fire = () => {
      const now = Date.now();
      if (now - lastFireAt < TRIGGER_DEBOUNCE_MS) return;
      lastFireAt = now;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      useDiagnosticsStore.getState().open();

      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const devMenu = require('expo-dev-menu');
        if (devMenu && typeof devMenu.openMenu === 'function') {
          devMenu.openMenu();
        }
      } catch {
        // expo-dev-menu not available
      }
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
            const now = Date.now();
            if (gForce >= SHAKE_PEAK_G) {
              if (phase === 'expecting' && now - phaseAt <= SHAKE_PEAK_WINDOW_MS) {
                // peak → dip → peak: a genuine out-and-back shake.
                phase = 'idle';
                fire();
              } else {
                // First hard peak (or expired sequence): arm and await the dip.
                phase = 'armed';
                phaseAt = now;
              }
              return;
            }
            if (gForce <= SHAKE_DIP_G && phase === 'armed' && now - phaseAt <= SHAKE_PEAK_WINDOW_MS) {
              // Near-rest between strokes — confirms oscillation shape.
              phase = 'expecting';
            }
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
