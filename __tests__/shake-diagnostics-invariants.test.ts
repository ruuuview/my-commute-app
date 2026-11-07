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
    expect(useDiagnosticsStore.getState().isOpen).toBe(false);

    const { unmount } = await renderHook(() => useDiagnosticsTriggers());
    expect(mockState.callback).not.toBeNull();

    await act(async () => {
      // Simulate physical shake with G-force > 1.35 (e.g. 2.1G)
      mockState.callback!({ x: 1.5, y: 1.2, z: 0.8 });
    });

    // Drawer must be open
    expect(useDiagnosticsStore.getState().isOpen).toBe(true);
    // DevMenu openMenu was still attempted
    expect(mockState.openMenu).toHaveBeenCalled();

    await act(async () => {
      unmount();
    });
    expect(mockState.remove).toHaveBeenCalled();
  });

  it('runtime invariant: physical shake opens diagnostics drawer even when devMenu.openMenu throws an exception', async () => {
    mockState.openMenu.mockImplementationOnce(() => {
      throw new Error('Fatal devMenu bridge crash');
    });
    expect(useDiagnosticsStore.getState().isOpen).toBe(false);

    const { unmount } = await renderHook(() => useDiagnosticsTriggers());
    expect(mockState.callback).not.toBeNull();

    await act(async () => {
      mockState.callback!({ x: 1.5, y: 1.2, z: 0.8 });
    });

    // Drawer must still be open
    expect(useDiagnosticsStore.getState().isOpen).toBe(true);
    expect(mockState.openMenu).toHaveBeenCalled();

    await act(async () => {
      unmount();
    });
  });
});
