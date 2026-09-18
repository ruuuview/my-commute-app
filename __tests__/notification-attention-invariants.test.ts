import fs from 'fs';
import path from 'path';

describe('Notification Settings Truth Table Invariants', () => {
  const settingsPath = path.resolve(__dirname, '../app/settings.tsx');
  const settingsSrc = fs.readFileSync(settingsPath, 'utf8');

  test('comprehensive OS permission detection includes granted, status, and iOS flags', () => {
    // Must check notif.granted, notif.status === 'granted', and iOS specific status/alerts
    expect(settingsSrc).toMatch(/notif\.granted/);
    expect(settingsSrc).toMatch(/notif\.status === 'granted'/);
    expect(settingsSrc).toMatch(/notif\.ios/);
  });

  test('no stale memory override: attentionRow visibility governed strictly by osNotificationsGranted', () => {
    // Must NOT allow notifDecision to override OS reality and hide blocked alerts
    expect(settingsSrc).not.toMatch(/isNotificationsEnabled\s*=\s*osNotificationsGranted\s*\|\|\s*notifDecision/);
    expect(settingsSrc).toMatch(/if\s*\(shushPreferences\.alertDeliveryMode\s*!==\s*'off'\s*&&\s*!osNotificationsGranted\)/);
  });

  test('blocked OS notifications direct user to Open Settings', () => {
    expect(settingsSrc).toMatch(/id:\s*'notif_blocked'/);
    expect(settingsSrc).toMatch(/actionLabel:\s*'Open Settings'/);
    expect(settingsSrc).toMatch(/Linking\.openSettings/);
  });

  test('undetermined OS notifications prompt in-app Turn On', () => {
    expect(settingsSrc).toMatch(/id:\s*'notif_enable'/);
    expect(settingsSrc).toMatch(/actionLabel:\s*'Turn On'/);
    expect(settingsSrc).toMatch(/handleRequestNotificationPermission/);
  });

  test('AppState change listener checks OS permissions on app foregrounding', () => {
    expect(settingsSrc).toMatch(/AppState\.addEventListener\('change',\s*\(state\)\s*=>\s*\{/);
    expect(settingsSrc).toMatch(/if\s*\(state\s*===\s*'active'\)\s*\{\s*void checkOsPermissions\(\);/);
  });
});
