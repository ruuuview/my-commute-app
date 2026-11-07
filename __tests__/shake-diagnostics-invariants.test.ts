import fs from 'fs';
import path from 'path';
import { renderHook, act } from '@testing-library/react-native';

const mockState = {
  callback: null as ((data: { x: number; y: number; z: number }) => void) | null,
  remove: jest.fn(),
  openMenu: jest.fn(),
};

jest.mock('expo-sensors', () => ({
  Accelerometer: {
    setUpdateInterval: jest.fn(),
    addListener: jest.fn((cb: (data: { x: number; y: number; z: number }) => void) => {
      mockState.callback = cb;
      return { remove: mockState.remove };
    }),
  },
}));

jest.mock('expo-dev-menu', () => ({
  registerDevMenuItems: jest.fn().mockResolvedValue(undefined),
  openMenu: () => mockState.openMenu(),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: 'success' },
}));

import { useDiagnosticsTriggers } from '../hooks/useDiagnosticsTriggers';
import { useDiagnosticsStore } from '../store/diagnosticsStore';

/**
 * Shake-to-Diagnostics Global Trigger Invariants
 *
 * The Diagnostics & Sensors drawer must be openable WITHOUT navigating
 * Settings: a global 3-finger double-tap in the root layout, a physical
 * shake (once expo-sensors ships in the dev binary), and a native dev
 * menu item all funnel into one root-mounted modal via diagnosticsStore.
 */

describe('Shake-to-Diagnostics Global Trigger Invariants', () => {
  const rootDir = path.resolve(__dirname, '..');
  const layoutPath = path.resolve(rootDir, 'app/_layout.tsx');
  const settingsPath = path.resolve(rootDir, 'app/settings.tsx');
  const hookPath = path.resolve(rootDir, 'hooks/useDiagnosticsTriggers.ts');
  const storePath = path.resolve(rootDir, 'store/diagnosticsStore.ts');

  beforeEach(() => {
    useDiagnosticsStore.getState().close();
    mockState.openMenu.mockClear();
    mockState.callback = null;
  });

  it('mounts exactly one DiagnosticsModal at the root layout via the global store', () => {
    const layout = fs.readFileSync(layoutPath, 'utf8');
    expect(layout).toContain('useDiagnosticsStore');
    expect(layout).toContain('<DiagnosticsModal');
    expect(layout).toContain('GestureDetector');
    expect(layout).toContain('minPointers(3)');
  });

  it('keeps a single modal instance: settings opens the store and renders no modal of its own', () => {
    const settings = fs.readFileSync(settingsPath, 'utf8');
    expect(settings).not.toContain('<DiagnosticsModal');
    expect(settings).toContain('useDiagnosticsStore');
  });

  it('gates every dev trigger behind __DEV__', () => {
    const hook = fs.readFileSync(hookPath, 'utf8');
    expect(hook).toContain('__DEV__');
    expect(hook).toContain('registerDevMenuItems');
    expect(hook).toContain('Accelerometer');
    const layout = fs.readFileSync(layoutPath, 'utf8');
    expect(layout).toContain('.enabled(__DEV__)');
  });

  it('keeps the trigger path hermetic: zero live line-store reads', () => {
    const hook = fs.readFileSync(hookPath, 'utf8');
    const store = fs.readFileSync(storePath, 'utf8');
    expect(hook).not.toContain('useLineDataStore');
    expect(store).not.toContain('useLineDataStore');
  });

  it('strictly opens the store BEFORE attempting devMenu.openMenu (no swallow invariant)', () => {
    const hook = fs.readFileSync(hookPath, 'utf8');
    const storeOpenIndex = hook.indexOf('useDiagnosticsStore.getState().open()');
    const devMenuOpenIndex = hook.indexOf('devMenu.openMenu()');
    expect(storeOpenIndex).toBeGreaterThan(-1);
    expect(devMenuOpenIndex).toBeGreaterThan(-1);
    expect(storeOpenIndex).toBeLessThan(devMenuOpenIndex);
  });

  it('runtime invariant: physical shake opens diagnostics drawer when devMenu.openMenu is a silent no-op (New Arch)', async () => {
    jest.useFakeTimers({ now: new Date(1000000) });
    try {
      expect(useDiagnosticsStore.getState().isOpen).toBe(false);

      const { unmount } = await renderHook(() => useDiagnosticsTriggers());
      expect(mockState.callback).not.toBeNull();

      await act(async () => {
        // Real shake = out stroke → stop dip → back stroke.
        mockState.callback!({ x: 2.4, y: 2.2, z: 1.4 }); // |a| ≈ 3.53 peak 1
        mockState.callback!({ x: 0.5, y: 0.4, z: 0.6 }); // |a| ≈ 0.88 dip
        mockState.callback!({ x: 2.2, y: 1.9, z: 1.5 }); // |a| ≈ 3.30 peak 2
      });

      // Drawer must be open
      expect(useDiagnosticsStore.getState().isOpen).toBe(true);
      // DevMenu openMenu was still attempted
      expect(mockState.openMenu).toHaveBeenCalled();

      await act(async () => {
        unmount();
      });
      expect(mockState.remove).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('runtime invariant: a gentle bump (≈1.6G, single peak) must NOT open the drawer (accidental-trigger ban)', async () => {
    expect(useDiagnosticsStore.getState().isOpen).toBe(false);

    const { unmount } = await renderHook(() => useDiagnosticsTriggers());

    // Lifting / pocket-jog class motion: one peak ~1.6G, gravity offset ±0.4
    await act(async () => {
      mockState.callback!({ x: 0.9, y: 0.7, z: 1.2 }); // |a| ≈ 1.67
      mockState.callback!({ x: 1.0, y: 0.8, z: 1.3 }); // |a| ≈ 1.84
    });

    expect(useDiagnosticsStore.getState().isOpen).toBe(false);
    expect(mockState.openMenu).not.toHaveBeenCalled();

    await act(async () => {
      unmount();
    });
  });

  it('runtime invariant: two heavy bumps spaced apart in time are NOT a shake (no oscillation)', async () => {
    jest.useFakeTimers({ now: new Date(1000000) });
    try {
      const { unmount } = await renderHook(() => useDiagnosticsTriggers());

      await act(async () => {
        mockState.callback!({ x: 2.2, y: 1.4, z: 1.5 }); // |a| ≈ 2.97 peak
      });
      // Longer than the oscillation window — separate movement, not a shake.
      expect(useDiagnosticsStore.getState().isOpen).toBe(false);

      jest.setSystemTime(new Date(1000000 + 1200));
      await act(async () => {
        mockState.callback!({ x: 2.2, y: 1.4, z: 1.5 }); // |a| ≈ 2.97 peak
      });

      expect(useDiagnosticsStore.getState().isOpen).toBe(false);
      expect(mockState.openMenu).not.toHaveBeenCalled();

      await act(async () => {
        unmount();
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('runtime invariant: a wrist twist (sustained force, no stop-dip) must NOT open the drawer', async () => {
    expect(useDiagnosticsStore.getState().isOpen).toBe(false);

    const { unmount } = await renderHook(() => useDiagnosticsTriggers());

    // Twist profile: peaks ~3.0G with sustained centripetal force between
    // them (magnitude never falls back to ~rest). Same two-peak shape as a
    // shake but zero oscillation dip.
    await act(async () => {
      mockState.callback!({ x: 1.9, y: 1.8, z: 1.2 }); // |a| ≈ 2.87  below new peak gate
      mockState.callback!({ x: 2.1, y: 2.0, z: 1.4 }); // |a| ≈ 3.24  peak, armed
    });
    // Sustained rotation: no rest — magnitude stays high.
    await act(async () => {
      mockState.callback!({ x: 1.9, y: 1.8, z: 1.6 }); // |a| ≈ 3.07 dip ABOVE SHAKE_DIP_G
      mockState.callback!({ x: 2.2, y: 2.1, z: 1.3 }); // |a| ≈ 3.35  second peak — must be ignored (no dip)
    });

    expect(useDiagnosticsStore.getState().isOpen).toBe(false);
    expect(mockState.openMenu).not.toHaveBeenCalled();

    await act(async () => {
      unmount();
    });
  });

  it('threshold constants ban the old 1.35G bump detector', () => {
    const hook = fs.readFileSync(hookPath, 'utf8');
    // Peak gate: firm-but-not-violent shake band (2.4–2.9 G). Twist
    // discrimination comes from the dip gate, so the peak may stay humane.
    expect(hook).toMatch(/SHAKE_PEAK_G\s*=\s*2\.[4-9]/);
    // Oscillation stop-dip gate: inter-shake rest is below 1.4-1.7 G —
    // the twist discriminator must stay strict.
    expect(hook).toMatch(/SHAKE_DIP_G\s*=\s*1\.[4567]/);
    // Oscillation window among real spikes.
    expect(hook).toMatch(/SHAKE_PEAK_WINDOW_MS\s*=\s*(8|9)0\d/);
    // Old threshold is gone.
    expect(hook).not.toContain('SHAKE_THRESHOLD_G');
    expect(hook).not.toContain('lastPeakAt = 0;\n              fire');
  });

  it('runtime invariant: physical shake opens diagnostics drawer even when devMenu.openMenu throws an exception', async () => {
    jest.useFakeTimers({ now: new Date(2000000) });
    try {
      mockState.openMenu.mockImplementationOnce(() => {
        throw new Error('Fatal devMenu bridge crash');
      });
      expect(useDiagnosticsStore.getState().isOpen).toBe(false);

      const { unmount } = await renderHook(() => useDiagnosticsTriggers());
      expect(mockState.callback).not.toBeNull();

      await act(async () => {
        mockState.callback!({ x: 2.4, y: 2.2, z: 1.4 }); // |a| ≈ 3.53 peak 1
        mockState.callback!({ x: 0.5, y: 0.4, z: 0.6 }); // |a| ≈ 0.88 dip
        mockState.callback!({ x: 2.2, y: 1.9, z: 1.5 }); // |a| ≈ 3.30 peak 2
      });

      // Drawer must still be open
      expect(useDiagnosticsStore.getState().isOpen).toBe(true);
      expect(mockState.openMenu).toHaveBeenCalled();

      await act(async () => {
        unmount();
      });
    } finally {
      jest.useRealTimers();
    }
  });
});

