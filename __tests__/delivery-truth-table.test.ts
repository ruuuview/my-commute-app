import * as fs from 'fs';
import * as path from 'path';
import { Platform } from 'react-native';
import { LiveActivityService } from '../services/LiveActivityService';

describe('Delivery Truth Table & Two-Bit Native Bridge Invariants', () => {
  const settingsPath = path.resolve(__dirname, '../app/settings.tsx');

  test('Settings file structurally enforces all 7 rows of the Intent × Delivery Truth Table', () => {
    expect(fs.existsSync(settingsPath)).toBe(true);
    const content = fs.readFileSync(settingsPath, 'utf8');

    // Row 1: Standard + Notifications Granted -> Zero warning banner, positive delivery confirmation
    expect(content).toContain("shushPreferences.alertDeliveryMode === 'loud' && osNotificationsGranted");
    expect(content).toContain('testID="truth-table-row-1"');
    expect(content).toContain('Alerts appear as banners with sound during disruptions.');

    // Row 2: Standard + Notifications Undetermined -> Anti-Badger Prominent Card with [Enable]
    expect(content).toContain("shushPreferences.alertDeliveryMode === 'loud' && !osNotificationsGranted && (osNotifStatus === Notifications.PermissionStatus.UNDETERMINED");
    expect(content).toContain('testID="truth-table-row-2"');
    expect(content).toContain('styles.prominentWarningCard');
    expect(content).toContain('Enable push notifications to receive line disruption banners on your lock screen.');
    expect(content).toContain('styles.prominentEnableBtn');

    // Row 3: Standard + Notifications Denied -> Anti-Badger Quiet Slate Line with [Settings]
    expect(content).toContain("shushPreferences.alertDeliveryMode === 'loud' && !osNotificationsGranted && (osNotifStatus === Notifications.PermissionStatus.DENIED");
    expect(content).toContain('testID="truth-table-row-3"');
    expect(content).toContain('styles.quietSlateRow');
    expect(content).toContain('Notifications disabled in iOS Settings. Lock screen banners cannot be delivered.');
    expect(content).toContain('styles.inlineSettingsBtn');

    // Row 4: Ambient + Live Activities Supported & Enabled -> Zero warning banner
    expect(content).toContain("shushPreferences.alertDeliveryMode === 'shush' && liveActivityAuth.supported && liveActivityAuth.enabled");
    expect(content).toContain('testID="truth-table-row-4"');
    expect(content).toContain('Silent updates visible on Dynamic Island & Lock Screen.');

    // Row 5: Ambient + Live Activities Supported & Disabled -> Anti-Badger Quiet Slate Line with [Settings]
    expect(content).toContain("shushPreferences.alertDeliveryMode === 'shush' && liveActivityAuth.supported && !liveActivityAuth.enabled");
    expect(content).toContain('testID="truth-table-row-5"');
    expect(content).toContain('Live Activities disabled in iOS Settings. Lock screen widget cannot update.');

    // Row 6: Muted -> Zero warning banner
    expect(content).toContain("shushPreferences.alertDeliveryMode === 'off'");
    expect(content).toContain('testID="truth-table-row-6"');
    expect(content).toContain('No alerts. Check status manually in-app.');

    // Row 7: Ambient + Live Activities Unsupported -> Anti-Badger Quiet Slate Line (NO button)
    expect(content).toContain("shushPreferences.alertDeliveryMode === 'shush' && !liveActivityAuth.supported");
    expect(content).toContain('testID="truth-table-row-7"');
    expect(content).toContain('Live Activities require iOS 16.1 or later. Ambient mode is unavailable on this device.');
  });

  test('AppState active listener refreshes permissions on foreground resume (Catch C round-trip invariant)', () => {
    const content = fs.readFileSync(settingsPath, 'utf8');

    expect(content).toContain("AppState.addEventListener('change'");
    expect(content).toContain("state === 'active'");
    expect(content).toContain('checkOsPermissions()');
    expect(content).toContain('checkLiveActivityAuth()');
  });

  describe('Two-Bit Native Bridge Behavioral Evaluation (Catch A Invariant)', () => {
    const originalOS = Platform.OS;

    beforeEach(() => {
      Platform.OS = 'ios';
    });

    afterEach(() => {
      LiveActivityService._setNativeModuleForTesting(null);
    });

    afterAll(() => {
      Platform.OS = originalOS;
    });

    test('Maps { supported: true, enabled: true } -> supported (Row 4 path)', async () => {
      LiveActivityService._setNativeModuleForTesting({
        activityAuthorizationInfo: async () => ({ supported: true, enabled: true }),
        areActivitiesEnabled: async () => true,
      });

      const info = await LiveActivityService.getActivityAuthorizationInfo();
      expect(info).toEqual({ supported: true, enabled: true });

      const status = await LiveActivityService.getSupportStatus();
      expect(status).toBe('supported');

      const areEnabled = await LiveActivityService.areActivitiesEnabled();
      expect(areEnabled).toBe(true);
    });

    test('Maps { supported: true, enabled: false } -> system_disabled (Row 5 path)', async () => {
      LiveActivityService._setNativeModuleForTesting({
        activityAuthorizationInfo: async () => ({ supported: true, enabled: false }),
        areActivitiesEnabled: async () => false,
      });

      const info = await LiveActivityService.getActivityAuthorizationInfo();
      expect(info).toEqual({ supported: true, enabled: false });

      const status = await LiveActivityService.getSupportStatus();
      expect(status).toBe('system_disabled');

      const areEnabled = await LiveActivityService.areActivitiesEnabled();
      expect(areEnabled).toBe(false);
    });

    test('Maps { supported: false, enabled: false } -> unsupported (Row 7 path)', async () => {
      LiveActivityService._setNativeModuleForTesting({
        activityAuthorizationInfo: async () => ({ supported: false, enabled: false }),
        areActivitiesEnabled: async () => false,
      });

      const info = await LiveActivityService.getActivityAuthorizationInfo();
      expect(info).toEqual({ supported: false, enabled: false });

      const status = await LiveActivityService.getSupportStatus();
      expect(status).toBe('unsupported');

      const areEnabled = await LiveActivityService.areActivitiesEnabled();
      expect(areEnabled).toBe(false);
    });
  });
});
