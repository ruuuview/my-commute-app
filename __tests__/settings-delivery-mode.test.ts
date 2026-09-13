import * as fs from 'fs';
import * as path from 'path';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { LiveActivityService } from '../services/LiveActivityService';

describe('Settings Delivery Mode & Alert Configuration Invariants', () => {
  const settingsPath = path.resolve(__dirname, '../app/settings.tsx');

  test('Settings file exists and contains zero fake alert switch states', () => {
    expect(fs.existsSync(settingsPath)).toBe(true);
    const content = fs.readFileSync(settingsPath, 'utf8');

    // Poka-Yoke: Fake local state switches must NEVER return
    expect(content).not.toContain('const [disruptionAlertsEnabled');
    expect(content).not.toContain('const [severeAlertsEnabled');
    expect(content).not.toContain('const [minorAlertsEnabled');
    expect(content).not.toContain('handleToggleDisruptionAlerts');
    expect(content).not.toContain('styles.dimmedRow');
    expect(content).not.toContain('styles.childRow');
  });

  test('Settings file implements clean collapse on Off delivery mode', () => {
    const content = fs.readFileSync(settingsPath, 'utf8');

    // Must conditionally render collapsed card when alertDeliveryMode is 'off'
    expect(content).toContain("shushPreferences.alertDeliveryMode === 'off'");
    expect(content).toContain('All notifications paused');
    expect(content).toContain('Tap Loud or Shush above to configure alerts');
    expect(content).toContain('styles.collapsedOffRow');
    expect(content).toContain('styles.collapsedOffTitle');
    expect(content).toContain('styles.collapsedOffSubtitle');
  });

  test('Settings file wires real Severe Suspension Bypass control', () => {
    const content = fs.readFileSync(settingsPath, 'utf8');

    expect(content).toContain('Severe Suspension Bypass');
    expect(content).toContain('severeBypassAlertHours');
    expect(content).toContain('setSevereBypassAlertHours');
  });

  test('Settings file features honest time-sensitive copy and interactive test toggle', () => {
    const content = fs.readFileSync(settingsPath, 'utf8');

    // Clear and honest Time-Sensitive copy
    expect(content).toContain('Urgent Closure Alerts');
    expect(content).toContain('Allow urgent closure alerts so you&apos;re notified when a Tube line is suspended.');
    expect(content).toContain('>Allow<');

    // Preview button toggles state between test and end
    expect(content).toContain('End Preview (Lock screen to view)');
    expect(content).toContain('Test Shush Mode (Preview on Lock Screen)');
    expect(content).toContain('areActivitiesEnabled');
    expect(content).toContain('stopPreviewActivity');
  });

  test('Store persists severeBypassAlertHours updates', () => {
    const store = useUserPreferencesStore.getState();
    expect(typeof store.severeBypassAlertHours).toBe('boolean');

    store.setSevereBypassAlertHours(false);
    expect(useUserPreferencesStore.getState().severeBypassAlertHours).toBe(false);

    store.setSevereBypassAlertHours(true);
    expect(useUserPreferencesStore.getState().severeBypassAlertHours).toBe(true);
  });

  test('LiveActivityService exposes areActivitiesEnabled and stopPreviewActivity', async () => {
    expect(typeof LiveActivityService.areActivitiesEnabled).toBe('function');
    const enabled = await LiveActivityService.areActivitiesEnabled();
    expect(typeof enabled).toBe('boolean');

    expect(typeof LiveActivityService.stopPreviewActivity).toBe('function');
    await expect(LiveActivityService.stopPreviewActivity()).resolves.not.toThrow();
  });
});
