import { estimateFare, isPeakTime } from '../services/fareTable';
import {
  SessionManager,
  validateArrival,
  STATION_COMPLEXES,
  TUNNEL_SEGMENTS,
  GEOFENCE_CONFIG,
} from '../services/SessionManager';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { LiveActivityService } from '../services/LiveActivityService';
import { computeDetour } from '../services/detourComputer';

describe('Shush Mode Production Specification v2.0 Tests', () => {
  describe('March 2026 Fare Table & Estimate Fare', () => {
    it('calculates peak and off-peak fares correctly for Zone 1-1', () => {
      // Monday 8:30 AM (Peak)
      const mondayPeak = new Date('2026-03-09T08:30:00Z');
      expect(isPeakTime(mondayPeak)).toBe(true);
      expect(estimateFare(1, 1, mondayPeak)).toBe('3.10');

      // Monday 11:30 AM (Off-peak)
      const mondayOffpeak = new Date('2026-03-09T11:30:00Z');
      expect(isPeakTime(mondayOffpeak)).toBe(false);
      expect(estimateFare(1, 1, mondayOffpeak)).toBe('3.00');
    });

    it('calculates Zone 1-2 fares correctly', () => {
      const peakTime = new Date('2026-03-09T17:30:00Z'); // 17:30 Monday is peak
      expect(isPeakTime(peakTime)).toBe(true);
      expect(estimateFare(1, 2, peakTime)).toBe('3.60');

      const offPeakTime = new Date('2026-03-09T14:00:00Z');
      expect(isPeakTime(offPeakTime)).toBe(false);
      expect(estimateFare(1, 2, offPeakTime)).toBe('3.10');
    });

    it('handles inverted zone orders symmetrically', () => {
      const peakTime = new Date('2026-03-09T08:00:00Z');
      expect(estimateFare(2, 1, peakTime)).toBe(estimateFare(1, 2, peakTime));
      expect(estimateFare(6, 1, peakTime)).toBe(estimateFare(1, 6, peakTime));
    });

    it('handles weekend as off-peak', () => {
      const saturdayNoon = new Date('2026-03-14T12:00:00Z');
      expect(isPeakTime(saturdayNoon)).toBe(false);
      expect(estimateFare(1, 1, saturdayNoon)).toBe('3.00');
    });
  });

  describe('Arrival Validation (No CLVisit)', () => {
    const dest = { lat: 51.5036, lng: -0.1143 }; // Waterloo

    it('dismisses when accurate GPS is within 100m of destination', () => {
      const closeGPS = { lat: 51.5037, lng: -0.1142, accuracy: 15 };
      const action = validateArrival(300, closeGPS, Date.now(), dest);
      expect(action).toEqual({ type: 'dismiss', delaySeconds: 60 });
    });

    it('does not dismiss when GPS accuracy is poor (>50m)', () => {
      const poorGPS = { lat: 51.5037, lng: -0.1142, accuracy: 80 };
      const action = validateArrival(300, poorGPS, Date.now(), dest);
      expect(action).toEqual({ type: 'keepRunning' });
    });

    it('dismisses when countdown timer hits 0 and server update is recent (<90s)', () => {
      const action = validateArrival(0, null, Date.now() - 30 * 1000, dest);
      expect(action).toEqual({ type: 'dismiss', delaySeconds: 60 });
    });

    it('handles tunnel segment timeout when timer has expired', () => {
      const tunnel = TUNNEL_SEGMENTS.central_holborn_to_chancery_lane;
      // segment max duration is 180s. timeout is max(120, 180 + 60) = 240s
      const expiredUnderTimeout = validateArrival(-150, null, Date.now() - 120 * 1000, dest, tunnel);
      expect(expiredUnderTimeout).toEqual({ type: 'keepRunning' });

      const expiredPastTimeout = validateArrival(-260, null, Date.now() - 120 * 1000, dest, tunnel);
      expect(expiredPastTimeout).toEqual({ type: 'dismiss', delaySeconds: 120 });
    });
  });

  describe('Zone 1 Station Complexes & Geofence Radii', () => {
    it('defines station complexes with 100m radii to prevent overlap', () => {
      expect(STATION_COMPLEXES.kings_cross_st_pancras.radius).toBe(100);
      expect(STATION_COMPLEXES.bank_monument.radius).toBe(100);
      expect(STATION_COMPLEXES.oxford_circus.radius).toBe(100);
    });

    it('configures safe geofence parameters', () => {
      expect(GEOFENCE_CONFIG.ORIGIN_RADIUS_METERS).toBe(150);
      expect(GEOFENCE_CONFIG.ORIGIN_COOLDOWN_MS).toBe(3600000);
      expect(GEOFENCE_CONFIG.DESTINATION_INNER_RADIUS_METERS).toBe(100);
      expect(GEOFENCE_CONFIG.DESTINATION_OUTER_RADIUS_METERS).toBe(200);
    });
  });

  describe('Shush Preferences Store Management', () => {
    it('initializes default Shush preferences and allows transitions', () => {
      const store = useUserPreferencesStore.getState();
      expect(store.shushPreferences).toBeDefined();
      expect(['loud', 'shush', 'off']).toContain(store.shushPreferences.alertDeliveryMode);

      store.setAlertDeliveryMode('shush');
      expect(useUserPreferencesStore.getState().shushPreferences.alertDeliveryMode).toBe('shush');

      store.setShushActivation('smart');
      expect(useUserPreferencesStore.getState().shushPreferences.shushActivation).toBe('smart');

      store.setTimeSensitiveGranted(true);
      expect(useUserPreferencesStore.getState().shushPreferences.timeSensitiveGranted).toBe(true);

      store.setHasCompletedShushOnboarding(true);
      expect(useUserPreferencesStore.getState().shushPreferences.hasCompletedShushOnboarding).toBe(true);
    });
  });

  describe('Universal Dashboard Geofence & Station-Fix Invariant (Rule 10)', () => {
    it('initiates origin detection for ANY pinned dashboard station including "other" role', async () => {
      const startSpy = jest.spyOn(LiveActivityService, 'start').mockResolvedValue('mock-activity-id');
      const updateSpy = jest.spyOn(LiveActivityService, 'update').mockResolvedValue(undefined);
      const store = useUserPreferencesStore.getState();
      
      // Pin home, work, and other
      store.pinStation({ id: '940GZZLUKSX', name: "King's Cross", lines: ['victoria'], zone: 1 }, 'home');
      store.pinStation({ id: '940GZZLUVIC', name: 'Victoria', lines: ['victoria'], zone: 1 }, 'work');
      store.pinStation({ id: '940GZZLUOXC', name: 'Oxford Circus', lines: ['victoria'], zone: 1 }, 'other');

      // Geofence enter for 'other' role initiates session per Rule 10
      await SessionManager.handleGeofenceEnter('940GZZLUOXC', 'other', 'Oxford Circus');
      expect(SessionManager.getSessionState()).toBe('active');
      await SessionManager.closeSession(true);
      startSpy.mockRestore();
      updateSpy.mockRestore();
    });
  });

  describe('LiveActivityService Lifecycle & Shush Mode Mode Checks', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it('suppresses start when delivery mode is OFF', async () => {
      const store = useUserPreferencesStore.getState();
      store.setAlertDeliveryMode('off');

      const activityId = await LiveActivityService.start('940GZZLUKSX', 'victoria');
      expect(activityId).toBeNull();
    });

    it('runs preview activity and respects active queries', async () => {
      const store = useUserPreferencesStore.getState();
      store.setAlertDeliveryMode('shush');

      // preview activity triggers without crashing
      const id = await LiveActivityService.startPreviewActivity();
      // in mock jest environment, returns null gracefully or string
      expect(id === null || typeof id === 'string').toBe(true);

      // Fast forward preview timeout
      jest.advanceTimersByTime(5100);

      await LiveActivityService.end('test_end');
      const active = await LiveActivityService.isActive();
      expect(active).toBe(false);
    });

    it('runs simulated Northern commute with Bank & Charing Cross endpoints without crashing', async () => {
      const id = await LiveActivityService.startSimulatedNorthernCommute();
      expect(id === null || typeof id === 'string').toBe(true);

      await LiveActivityService.stopSimulatedCommute();
      const active = await LiveActivityService.isActive();
      expect(active).toBe(false);
    });
  });

  describe('Detour Computation (Section 14 & Edge Case 16)', () => {
    it('computes detour alternative avoiding self-line recommendation', () => {
      const victoriaDetour = computeDetour('victoria');
      expect(victoriaDetour).toBeDefined();
      expect(victoriaDetour!.detourLine).not.toBe('victoria');
      expect(victoriaDetour!.detourLine).toBe('northern');
      expect(victoriaDetour!.detourStatus).toBe('good');

      const northernDetour = computeDetour('northern');
      expect(northernDetour!.detourLine).toBe('victoria');
      expect(northernDetour!.transferStation).toBe('Euston');
    });

    it('bypasses delayed line if on-time candidate exists', () => {
      const centralDetour = computeDetour('central', {
        jubilee: 'minor_delays',
        piccadilly: 'good',
        elizabeth: 'good',
      });
      expect(centralDetour!.detourLine).toBe('piccadilly');
      expect(centralDetour!.detourStatus).toBe('good');
    });
  });
});

