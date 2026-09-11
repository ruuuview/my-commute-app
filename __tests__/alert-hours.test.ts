import { useUserPreferencesStore } from '../store/userPreferencesStore';

/**
 * Pure evaluation helper matching backgroundTask.ts alert hours filter logic.
 */
export function evaluateAlertDelivery(options: {
  alertHoursMode: 'custom' | '24h';
  alertWindowStart: string;
  alertWindowEnd: string;
  severeBypassAlertHours: boolean;
  currentTimeStr: string; // HH:MM
  currentSeverity: number; // 0=Good, 5=Suspended, 6=Severe, 9=Minor
}): { shouldDeliver: boolean; isWithinWindow: boolean; isBypass: boolean } {
  const is24HourMode =
    options.alertHoursMode === '24h' ||
    (options.alertWindowStart === '00:00' && options.alertWindowEnd === '23:59');

  const [currH, currM] = options.currentTimeStr.split(':').map(Number);
  const currentMinutes = currH * 60 + currM;

  let isWithinWindow = false;
  if (is24HourMode) {
    isWithinWindow = true;
  } else {
    const [startH, startM] = (options.alertWindowStart || '06:00').split(':').map(Number);
    const [endH, endM] = (options.alertWindowEnd || '22:00').split(':').map(Number);
    const startMinutes = (startH || 6) * 60 + (startM || 0);
    const endMinutes = (endH || 22) * 60 + (endM || 0);

    isWithinWindow =
      startMinutes <= endMinutes
        ? currentMinutes >= startMinutes && currentMinutes <= endMinutes
        : currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }

  const isSevere = options.currentSeverity <= 6;
  const isBypass = Boolean(options.severeBypassAlertHours && isSevere);
  const shouldDeliver = isWithinWindow || isBypass;

  return { shouldDeliver, isWithinWindow, isBypass };
}

describe('Alert Hours 2-Mode Architecture & Overnight Shift Tests', () => {
  beforeEach(() => {
    // Reset store to known baseline
    useUserPreferencesStore.setState({
      alertHoursMode: 'custom',
      alertWindowStart: '06:00',
      alertWindowEnd: '22:00',
      severeBypassAlertHours: true,
    });
  });

  describe('User Preferences Store Layer', () => {
    it('initializes with custom mode, 06:00-22:00, and severe bypass enabled', () => {
      const state = useUserPreferencesStore.getState();
      expect(state.alertHoursMode).toBe('custom');
      expect(state.alertWindowStart).toBe('06:00');
      expect(state.alertWindowEnd).toBe('22:00');
      expect(state.severeBypassAlertHours).toBe(true);
    });

    it('updates alertHoursMode to 24h and back to custom', () => {
      const store = useUserPreferencesStore.getState();
      store.setAlertHoursMode('24h');
      expect(useUserPreferencesStore.getState().alertHoursMode).toBe('24h');

      store.setAlertHoursMode('custom');
      expect(useUserPreferencesStore.getState().alertHoursMode).toBe('custom');
    });

    it('updates custom alert window start and end times', () => {
      const store = useUserPreferencesStore.getState();
      store.setAlertHours('07:30', '19:45');
      const state = useUserPreferencesStore.getState();
      expect(state.alertWindowStart).toBe('07:30');
      expect(state.alertWindowEnd).toBe('19:45');
    });

    it('toggles severe disruption bypass policy', () => {
      const store = useUserPreferencesStore.getState();
      store.setSevereBypassAlertHours(false);
      expect(useUserPreferencesStore.getState().severeBypassAlertHours).toBe(false);

      store.setSevereBypassAlertHours(true);
      expect(useUserPreferencesStore.getState().severeBypassAlertHours).toBe(true);
    });
  });

  describe('Daytime Alert Window Evaluation (07:00 – 22:00)', () => {
    const config = {
      alertHoursMode: 'custom' as const,
      alertWindowStart: '07:00',
      alertWindowEnd: '22:00',
      severeBypassAlertHours: false,
    };

    it('allows alerts during mid-day commute (08:30)', () => {
      const result = evaluateAlertDelivery({
        ...config,
        currentTimeStr: '08:30',
        currentSeverity: 9, // Minor delays
      });
      expect(result.isWithinWindow).toBe(true);
      expect(result.shouldDeliver).toBe(true);
    });

    it('allows alerts at exact boundary times (07:00 and 22:00)', () => {
      const startBoundary = evaluateAlertDelivery({
        ...config,
        currentTimeStr: '07:00',
        currentSeverity: 9,
      });
      expect(startBoundary.isWithinWindow).toBe(true);

      const endBoundary = evaluateAlertDelivery({
        ...config,
        currentTimeStr: '22:00',
        currentSeverity: 9,
      });
      expect(endBoundary.isWithinWindow).toBe(true);
    });

    it('suppresses alerts before start time (06:45) when bypass is off', () => {
      const result = evaluateAlertDelivery({
        ...config,
        currentTimeStr: '06:45',
        currentSeverity: 9,
      });
      expect(result.isWithinWindow).toBe(false);
      expect(result.shouldDeliver).toBe(false);
    });

    it('suppresses alerts after end time (23:15) when bypass is off', () => {
      const result = evaluateAlertDelivery({
        ...config,
        currentTimeStr: '23:15',
        currentSeverity: 9,
      });
      expect(result.isWithinWindow).toBe(false);
      expect(result.shouldDeliver).toBe(false);
    });
  });

  describe('P0 Midnight Fix: Overnight Shift Window (21:00 – 06:00)', () => {
    const overnightConfig = {
      alertHoursMode: 'custom' as const,
      alertWindowStart: '21:00',
      alertWindowEnd: '06:00',
      severeBypassAlertHours: false,
    };

    it('allows alerts late night before midnight (22:45)', () => {
      const result = evaluateAlertDelivery({
        ...overnightConfig,
        currentTimeStr: '22:45',
        currentSeverity: 9,
      });
      expect(result.isWithinWindow).toBe(true);
      expect(result.shouldDeliver).toBe(true);
    });

    it('allows alerts at midnight (00:00)', () => {
      const result = evaluateAlertDelivery({
        ...overnightConfig,
        currentTimeStr: '00:00',
        currentSeverity: 9,
      });
      expect(result.isWithinWindow).toBe(true);
      expect(result.shouldDeliver).toBe(true);
    });

    it('allows alerts early morning after midnight (03:30)', () => {
      const result = evaluateAlertDelivery({
        ...overnightConfig,
        currentTimeStr: '03:30',
        currentSeverity: 9,
      });
      expect(result.isWithinWindow).toBe(true);
      expect(result.shouldDeliver).toBe(true);
    });

    it('allows alerts right before morning end time (05:59)', () => {
      const result = evaluateAlertDelivery({
        ...overnightConfig,
        currentTimeStr: '05:59',
        currentSeverity: 9,
      });
      expect(result.isWithinWindow).toBe(true);
      expect(result.shouldDeliver).toBe(true);
    });

    it('suppresses alerts during daytime sleeping hours (12:30)', () => {
      const result = evaluateAlertDelivery({
        ...overnightConfig,
        currentTimeStr: '12:30',
        currentSeverity: 9,
      });
      expect(result.isWithinWindow).toBe(false);
      expect(result.shouldDeliver).toBe(false);
    });

    it('suppresses alerts during evening prep hours (19:00)', () => {
      const result = evaluateAlertDelivery({
        ...overnightConfig,
        currentTimeStr: '19:00',
        currentSeverity: 9,
      });
      expect(result.isWithinWindow).toBe(false);
      expect(result.shouldDeliver).toBe(false);
    });
  });

  describe('24/7 Always On Mode Evaluation', () => {
    it('delivers alerts around the clock regardless of time', () => {
      const times = ['00:00', '03:15', '06:00', '12:00', '18:45', '23:59'];
      for (const time of times) {
        const result = evaluateAlertDelivery({
          alertHoursMode: '24h',
          alertWindowStart: '07:00',
          alertWindowEnd: '21:00',
          severeBypassAlertHours: false,
          currentTimeStr: time,
          currentSeverity: 9, // Non-severe
        });
        expect(result.isWithinWindow).toBe(true);
        expect(result.shouldDeliver).toBe(true);
      }
    });

    it('treats legacy 00:00 to 23:59 configuration as 24/7 mode', () => {
      const result = evaluateAlertDelivery({
        alertHoursMode: 'custom',
        alertWindowStart: '00:00',
        alertWindowEnd: '23:59',
        severeBypassAlertHours: false,
        currentTimeStr: '04:00',
        currentSeverity: 9,
      });
      expect(result.isWithinWindow).toBe(true);
      expect(result.shouldDeliver).toBe(true);
    });
  });

  describe('Severe Disruption Bypass Policy', () => {
    const strictConfig = {
      alertHoursMode: 'custom' as const,
      alertWindowStart: '07:00',
      alertWindowEnd: '21:00',
      currentTimeStr: '02:00', // Outside window
    };

    it('delivers severe suspension alert (severity 5) outside hours when bypass is enabled', () => {
      const result = evaluateAlertDelivery({
        ...strictConfig,
        severeBypassAlertHours: true,
        currentSeverity: 5, // Part Suspended
      });
      expect(result.isWithinWindow).toBe(false);
      expect(result.isBypass).toBe(true);
      expect(result.shouldDeliver).toBe(true);
    });

    it('delivers severe delay alert (severity 6) outside hours when bypass is enabled', () => {
      const result = evaluateAlertDelivery({
        ...strictConfig,
        severeBypassAlertHours: true,
        currentSeverity: 6, // Severe Delays
      });
      expect(result.isWithinWindow).toBe(false);
      expect(result.isBypass).toBe(true);
      expect(result.shouldDeliver).toBe(true);
    });

    it('suppresses minor delay alert (severity 9) outside hours even when bypass is enabled', () => {
      const result = evaluateAlertDelivery({
        ...strictConfig,
        severeBypassAlertHours: true,
        currentSeverity: 9, // Minor Delays
      });
      expect(result.isWithinWindow).toBe(false);
      expect(result.isBypass).toBe(false);
      expect(result.shouldDeliver).toBe(false);
    });

    it('suppresses severe suspension alert when bypass is disabled by user', () => {
      const result = evaluateAlertDelivery({
        ...strictConfig,
        severeBypassAlertHours: false,
        currentSeverity: 5, // Part Suspended
      });
      expect(result.isWithinWindow).toBe(false);
      expect(result.isBypass).toBe(false);
      expect(result.shouldDeliver).toBe(false);
    });
  });

  describe('Settings Subtitle String Formatting', () => {
    function formatSettingsSubtitle(mode: 'custom' | '24h', start: string, end: string, bypass: boolean): string {
      return mode === '24h'
        ? '24/7 (Always on)'
        : `${start} – ${end}${bypass ? ' · Severe always on' : ' · Strict'}`;
    }

    it('formats 24/7 mode subtitle cleanly', () => {
      expect(formatSettingsSubtitle('24h', '06:00', '22:00', true)).toBe('24/7 (Always on)');
    });

    it('formats custom daytime window with severe bypass enabled', () => {
      expect(formatSettingsSubtitle('custom', '07:00', '21:00', true)).toBe(
        '07:00 – 21:00 · Severe always on'
      );
    });

    it('formats custom overnight window with strict policy', () => {
      expect(formatSettingsSubtitle('custom', '21:00', '06:00', false)).toBe(
        '21:00 – 06:00 · Strict'
      );
    });
  });
});
