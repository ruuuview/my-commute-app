import fs from 'fs';
import path from 'path';

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
});
