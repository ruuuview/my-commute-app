import { registerDevicePushToken } from '../services/notificationRegistrationService';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { ensureDeviceIdentity } from '../services/deviceIdentity';
import { APP_CONFIG } from '../config/app.config';

jest.mock('../services/deviceIdentity', () => ({
  ensureDeviceIdentity: jest.fn().mockResolvedValue({
    userId: 'test-user-uuid',
    apiKey: 'test-api-key',
  }),
}));

describe('registerDevicePushToken alertDeliveryMode Invariants', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('includes alertDeliveryMode in POST payload to /api/devices/register', async () => {
    useUserPreferencesStore.setState({
      shushPreferences: {
        alertDeliveryMode: 'shush',
        shushActivation: 'always',
        shushSchedule: { weekdays: [1, 2, 3, 4, 5], windows: [] },
        hasCompletedShushOnboarding: true,
        timeSensitiveGranted: false,
        timeSensitiveStatus: 'disabled',
      },
    });

    let capturedUrl = '';
    let capturedBody: any = null;

    global.fetch = jest.fn().mockImplementation((url: string, options: any) => {
      capturedUrl = url;
      if (options?.body) {
        capturedBody = JSON.parse(options.body);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
        text: async () => JSON.stringify({ success: true }),
      } as Response);
    });

    const success = await registerDevicePushToken('test-push-token-123', ['central', 'victoria']);
    expect(success).toBe(true);
    expect(capturedUrl).toBe(`${APP_CONFIG.BACKEND_URL}/api/devices/register`);
    expect(capturedBody).not.toBeNull();
    expect(capturedBody.token).toBe('test-push-token-123');
    expect(capturedBody.lines).toEqual(['central', 'victoria']);
    expect(capturedBody.userId).toBe('test-user-uuid');
    expect(capturedBody.alertDeliveryMode).toBe('shush');
  });

  it('reflects explicit or changed mode in the registration payload', async () => {
    useUserPreferencesStore.setState({
      shushPreferences: {
        alertDeliveryMode: 'loud',
        shushActivation: 'always',
        shushSchedule: { weekdays: [1, 2, 3, 4, 5], windows: [] },
        hasCompletedShushOnboarding: true,
        timeSensitiveGranted: false,
        timeSensitiveStatus: 'disabled',
      },
    });

    let capturedBody: any = null;
    global.fetch = jest.fn().mockImplementation((_url: string, options: any) => {
      if (options?.body) {
        capturedBody = JSON.parse(options.body);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
        text: async () => JSON.stringify({ success: true }),
      } as Response);
    });

    const success = await registerDevicePushToken('test-push-token-456', ['jubilee']);
    expect(success).toBe(true);
    expect(capturedBody.alertDeliveryMode).toBe('loud');
  });
});
