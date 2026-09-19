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
    expect(content).toContain('Tap Standard or Ambient above to configure alerts');
    expect(content).toContain('styles.collapsedOffRow');
    expect(content).toContain('styles.collapsedOffTitle');
    expect(content).toContain('styles.collapsedOffSubtitle');
  });

  test('Settings file enforces Apple System tokens and eliminates hazard/neon colors', () => {
    const content = fs.readFileSync(settingsPath, 'utf8');
    const segmentedPath = path.resolve(__dirname, '../components/SegmentedGlassControl.tsx');
    const segmentedContent = fs.readFileSync(segmentedPath, 'utf8');

    // Option 1 Token Contract: Standard (System Blue #0A84FF), Ambient (System Indigo #5E5CE6), Muted (System Gray #8E8E93)
    expect(content).toContain('<SegmentedGlassControl');
    expect(segmentedContent).toContain("title: 'Standard'");
    expect(segmentedContent).toContain("title: 'Ambient'");
    expect(segmentedContent).toContain("title: 'Muted'");
    expect(segmentedContent).toContain('#0A84FF');
    expect(segmentedContent).toContain('#5E5CE6');

    // Poka-Yoke: Zero hazard amber or rave neon purple in settings or control
    expect(content).not.toContain('#FF9500');
    expect(content).not.toContain('#BF5AF2');
    expect(segmentedContent).not.toContain('#FF9500');
    expect(segmentedContent).not.toContain('#BF5AF2');

    // Intent x OS Permission delivery truth status line
    expect(content).toContain('!osNotificationsGranted');
    expect(content).toContain('Notifications disabled in iOS Settings. Lock screen banners cannot be delivered.');
    expect(content).toContain('Alerts appear as banners with sound during disruptions.');
  });

  test('Settings file wires real Severe Suspension Bypass control', () => {
    const content = fs.readFileSync(settingsPath, 'utf8');

    expect(content).toContain('Severe Suspension Bypass');
    expect(content).toContain('severeBypassAlertHours');
    expect(content).toContain('setSevereBypassAlertHours');
  });

  test('Settings file features honest time-sensitive copy, and QA preview button is quarantined in Diagnostics', () => {
    const content = fs.readFileSync(settingsPath, 'utf8');
    const diagPath = path.resolve(__dirname, '../components/DiagnosticsModal.tsx');
    const diagContent = fs.readFileSync(diagPath, 'utf8');

    // Clear and honest Time-Sensitive copy in settings gated on tri-state disabled
    expect(content).toContain("shushPreferences.timeSensitiveStatus === 'disabled'");
    expect(content).toContain('Urgent Closure Alerts');
    expect(content).toContain('Allow urgent closure alerts so you&apos;re notified when a Tube line is suspended.');
    expect(content).toContain('>Allow<');

    // Consumer settings must NOT contain raw developer preview buttons
    expect(content).not.toContain('Test Shush Mode (Preview on Lock Screen)');

    // Preview button and activation policy are safely quarantined in Diagnostics
    expect(diagContent).toContain('End Preview (Lock screen to view)');
    expect(diagContent).toContain('Test Shush Mode (Preview on Lock Screen)');
    expect(diagContent).toContain('areActivitiesEnabled');
    expect(diagContent).toContain('stopPreviewActivity');
    expect(diagContent).toContain('SHUSH ACTIVATION POLICY');
  });

  test('Store manages tri-state TimeSensitiveStatus accurately', () => {
    const store = useUserPreferencesStore.getState();
    expect(store.shushPreferences.timeSensitiveStatus).toBeDefined();

    store.setTimeSensitiveStatus('not_supported');
    expect(useUserPreferencesStore.getState().shushPreferences.timeSensitiveStatus).toBe('not_supported');
    expect(useUserPreferencesStore.getState().shushPreferences.timeSensitiveGranted).toBe(false);

    store.setTimeSensitiveStatus('disabled');
    expect(useUserPreferencesStore.getState().shushPreferences.timeSensitiveStatus).toBe('disabled');
    expect(useUserPreferencesStore.getState().shushPreferences.timeSensitiveGranted).toBe(false);

    store.setTimeSensitiveStatus('enabled');
    expect(useUserPreferencesStore.getState().shushPreferences.timeSensitiveStatus).toBe('enabled');
    expect(useUserPreferencesStore.getState().shushPreferences.timeSensitiveGranted).toBe(true);
  });

  test('Store persists severeBypassAlertHours updates', () => {
    const store = useUserPreferencesStore.getState();
    expect(typeof store.severeBypassAlertHours).toBe('boolean');

    store.setSevereBypassAlertHours(false);
    expect(useUserPreferencesStore.getState().severeBypassAlertHours).toBe(false);

    store.setSevereBypassAlertHours(true);
    expect(useUserPreferencesStore.getState().severeBypassAlertHours).toBe(true);
  });

  test('LiveActivityService exposes getTimeSensitiveStatus, areActivitiesEnabled, and stopPreviewActivity', async () => {
    expect(typeof LiveActivityService.getTimeSensitiveStatus).toBe('function');
    const status = await LiveActivityService.getTimeSensitiveStatus();
    expect(['not_supported', 'disabled', 'enabled']).toContain(status);

    expect(typeof LiveActivityService.areActivitiesEnabled).toBe('function');
    const enabled = await LiveActivityService.areActivitiesEnabled();
    expect(typeof enabled).toBe('boolean');

    expect(typeof LiveActivityService.stopPreviewActivity).toBe('function');
    await expect(LiveActivityService.stopPreviewActivity()).resolves.not.toThrow();
  });
});
