import { useUserPreferencesStore } from '../store/userPreferencesStore';
import {
  logSessionStart,
  logDwell,
  getPendingConfirmations,
  getAssumptionReveal,
  markAssumptionRevealed,
  confirmConfirmation,
  dismissConfirmation,
  undoLastConfirmation,
  getStationScores,
  type PendingConfirmation,
  type StationConfirmation,
} from '../utils/commuteInference';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Epoch ms for n days ago at local h:mm. */
function daysAgoAt(n: number, h: number, m = 0): number {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

function resetAll(): void {
  // The jest MMKV mock shares one Map across createMMKV() instances.
  const { createMMKV } = require('react-native-mmkv');
  createMMKV().clearAll();
  useUserPreferencesStore.setState({
    pinnedStations: [],
    alertHoursMode: 'custom',
    alertWindowStart: '06:00',
    alertWindowEnd: '22:00',
  });
}

function stationConfirmations(): StationConfirmation[] {
  return getPendingConfirmations().filter(
    (c): c is StationConfirmation => c.type === 'home' || c.type === 'work'
  );
}

beforeEach(() => {
  jest.useRealTimers();
  resetAll();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('commuteInference', () => {
  describe('N>=3 station triggering', () => {
    it('proposes home after 3 session starts in a 90-min bucket inside 30 days', () => {
      logSessionStart('st-a', daysAgoAt(6, 8, 5));
      logSessionStart('st-a', daysAgoAt(4, 8, 20));
      logSessionStart('st-a', daysAgoAt(2, 8, 50));
      const found = stationConfirmations();
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ type: 'home', stationId: 'st-a' });
    });

    it('does not trigger with only 2 observations', () => {
      logSessionStart('st-a', daysAgoAt(4, 8, 5));
      logSessionStart('st-a', daysAgoAt(2, 8, 20));
      expect(stationConfirmations()).toHaveLength(0);
    });

    it('does not trigger when observations span more than 90 minutes', () => {
      logSessionStart('st-a', daysAgoAt(6, 8, 0));
      logSessionStart('st-a', daysAgoAt(4, 8, 20));
      logSessionStart('st-a', daysAgoAt(2, 9, 35)); // 95 min span
      expect(stationConfirmations()).toHaveLength(0);
    });

    it('90-min bucket edges: 08:29/08:31/08:45 cluster together across a naive :30 boundary', () => {
      logSessionStart('st-a', daysAgoAt(6, 8, 29));
      logSessionStart('st-a', daysAgoAt(4, 8, 31));
      logSessionStart('st-a', daysAgoAt(2, 8, 45));
      // Sliding window groups them despite straddling 08:30.
      expect(stationConfirmations()).toHaveLength(1);
    });

    it('90-min bucket edge: exactly 90-minute span is within the bucket', () => {
      logSessionStart('st-a', daysAgoAt(6, 8, 0));
      logSessionStart('st-a', daysAgoAt(4, 8, 30));
      logSessionStart('st-a', daysAgoAt(2, 9, 0)); // span = 90 min exactly
      expect(stationConfirmations()).toHaveLength(1);
    });

    it('picks the top-scoring station when several qualify', () => {
      for (const n of [6, 4, 2]) logSessionStart('st-a', daysAgoAt(n, 8, 5));
      for (const n of [6, 5, 4, 3, 2]) logSessionStart('st-b', daysAgoAt(n, 8, 10));
      const found = stationConfirmations();
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ type: 'home', stationId: 'st-b' });
    });

    it('resolves stationName from stationCoordinates.json, falling back to stationId', () => {
      logSessionStart('HUBLST', daysAgoAt(6, 8, 5));
      logSessionStart('HUBLST', daysAgoAt(4, 8, 10));
      logSessionStart('HUBLST', daysAgoAt(2, 8, 15));
      const found = stationConfirmations();
      expect(found[0]).toMatchObject({ stationId: 'HUBLST', stationName: 'Liverpool Street' });

      resetAll();
      logSessionStart('nope-unknown', daysAgoAt(6, 8, 5));
      logSessionStart('nope-unknown', daysAgoAt(4, 8, 10));
      logSessionStart('nope-unknown', daysAgoAt(2, 8, 15));
      const found2 = stationConfirmations();
      expect(found2[0]).toMatchObject({ stationId: 'nope-unknown', stationName: 'nope-unknown' });
    });

    it('proposes work once home is set, and nothing once both are set', () => {
      for (const n of [6, 4, 2]) logSessionStart('st-a', daysAgoAt(n, 8, 5));
      for (const n of [6, 4, 2]) logSessionStart('st-b', daysAgoAt(n, 17, 40));

      useUserPreferencesStore.setState({
        pinnedStations: [{ id: 'st-a', name: 'A', lines: [], zone: 1, role: 'home' }],
      });
      let found = stationConfirmations();
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ type: 'work', stationId: 'st-b' });

      useUserPreferencesStore.setState({
        pinnedStations: [
          { id: 'st-a', name: 'A', lines: [], zone: 1, role: 'home' },
          { id: 'st-b', name: 'B', lines: [], zone: 1, role: 'work' },
        ],
      });
      found = stationConfirmations();
      expect(found).toHaveLength(0);
    });
  });

  describe('30-day decay pruning', () => {
    it('prunes observations older than 30 days on write', () => {
      logSessionStart('st-a', Date.now() - 31 * DAY_MS);
      logSessionStart('st-a', Date.now() - 32 * DAY_MS);
      logSessionStart('st-a', Date.now() - 33 * DAY_MS);
      expect(stationConfirmations()).toHaveLength(0);
      expect(getStationScores()).toEqual({});
    });

    it('keeps observations just inside the window but still needs N>=3 inside it', () => {
      logSessionStart('st-a', Date.now() - 29 * DAY_MS - 60 * 60 * 1000);
      logSessionStart('st-a', Date.now() - 28 * DAY_MS);
      // Only 2 inside the window -> no trigger.
      expect(stationConfirmations()).toHaveLength(0);
      expect(getStationScores()).toEqual({ 'st-a': 2 });
    });
  });

  describe('logDwell gates', () => {
    it('ignores dwells under 3 minutes', () => {
      jest.useFakeTimers();
      const base = daysAgoAt(3, 8, 5);
      jest.setSystemTime(base);
      logDwell('st-b', 2, 0);
      jest.setSystemTime(base + DAY_MS);
      logDwell('st-b', 2, 0);
      jest.setSystemTime(base + 2 * DAY_MS);
      logDwell('st-b', 2.9, 0);
      expect(getStationScores()).toEqual({});
      expect(stationConfirmations()).toHaveLength(0);
    });

    it('ignores dwells with speed above 7.2 km/h', () => {
      jest.useFakeTimers();
      const base = daysAgoAt(3, 8, 5);
      jest.setSystemTime(base);
      logDwell('st-b', 10, 7.3);
      jest.setSystemTime(base + DAY_MS);
      logDwell('st-b', 10, 20);
      expect(getStationScores()).toEqual({});
      expect(stationConfirmations()).toHaveLength(0);
    });

    it('qualifying dwells count toward the station N>=3 rule', () => {
      jest.useFakeTimers();
      const base = daysAgoAt(4, 8, 5);
      jest.setSystemTime(base);
      logSessionStart('st-c', base);
      jest.setSystemTime(base + DAY_MS);
      logDwell('st-c', 5, 0);
      jest.setSystemTime(base + 2 * DAY_MS);
      logDwell('st-c', 4, 7.2); // exactly 7.2 is allowed
      const found = stationConfirmations();
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ type: 'home', stationId: 'st-c' });
      expect(getStationScores()).toEqual({ 'st-c': 3 });
    });
  });

  describe('hours inference', () => {
    it('proposes windowStart = clusterStart - 15m and windowEnd = clusterStart + 90m', () => {
      logSessionStart('st-a', daysAgoAt(6, 8, 0));
      logSessionStart('st-b', daysAgoAt(4, 8, 20));
      logSessionStart('st-c', daysAgoAt(2, 8, 50)); // 60-min cluster starting 08:00
      const hours = getPendingConfirmations().filter((c) => c.type === 'hours');
      expect(hours).toHaveLength(1);
      expect(hours[0]).toEqual({ type: 'hours', windowStart: '07:45', windowEnd: '09:30' });
    });

    it('uses session starts only, not dwell observations', () => {
      jest.useFakeTimers();
      const base = daysAgoAt(4, 8, 5);
      jest.setSystemTime(base);
      logSessionStart('st-a', base);
      jest.setSystemTime(base + DAY_MS);
      logDwell('st-a', 5, 0);
      jest.setSystemTime(base + 2 * DAY_MS);
      logDwell('st-a', 5, 0);
      // Only 1 session start -> no hours proposal.
      expect(getPendingConfirmations().filter((c) => c.type === 'hours')).toHaveLength(0);
    });

    it('does not propose hours once the user has set custom alert hours', () => {
      logSessionStart('st-a', daysAgoAt(6, 8, 0));
      logSessionStart('st-b', daysAgoAt(4, 8, 20));
      logSessionStart('st-c', daysAgoAt(2, 8, 50));
      useUserPreferencesStore.setState({ alertWindowStart: '07:00', alertWindowEnd: '19:00' });
      expect(getPendingConfirmations().filter((c) => c.type === 'hours')).toHaveLength(0);
    });

    it('handles clusters near midnight with wraparound', () => {
      logSessionStart('st-a', daysAgoAt(6, 23, 50));
      logSessionStart('st-b', daysAgoAt(4, 0, 10));
      logSessionStart('st-c', daysAgoAt(2, 23, 55));
      const hours = getPendingConfirmations().filter((c) => c.type === 'hours');
      expect(hours).toHaveLength(1);
      // Cluster starts 23:50 -> 23:35 .. 01:20
      expect(hours[0]).toEqual({ type: 'hours', windowStart: '23:35', windowEnd: '01:20' });
    });
  });

  describe('14-day contradiction', () => {
    function confirmHomeAt(stationId: string) {
      useUserPreferencesStore.setState({
        pinnedStations: [{ id: stationId, name: stationId, lines: [], zone: 1, role: 'other' }],
      });
      const proposal = stationConfirmations().find((c) => c.stationId === stationId);
      confirmConfirmation(proposal ?? { type: 'home', stationId, stationName: stationId });
    }

    it('re-emits with reconfirm:true when the station is silent for 14 days but travel continues', () => {
      for (const n of [20, 19, 18]) logSessionStart('st-home', daysAgoAt(n, 8, 5));
      confirmHomeAt('st-home');
      // Travel continues at other stations on >= 3 days inside the trailing 14.
      for (const n of [10, 7, 3, 1]) logSessionStart('st-other', daysAgoAt(n, 8, 10));

      const reconfirms = getPendingConfirmations().filter(
        (c) => c.type === 'home' && (c as { reconfirm?: boolean }).reconfirm === true
      );
      expect(reconfirms).toHaveLength(1);
      expect(reconfirms[0]).toMatchObject({ type: 'home', stationId: 'st-home', reconfirm: true });
    });

    it('does not re-emit when fewer than 3 travel days exist in the window', () => {
      for (const n of [20, 19, 18]) logSessionStart('st-home', daysAgoAt(n, 8, 5));
      confirmHomeAt('st-home');
      for (const n of [10, 3]) logSessionStart('st-other', daysAgoAt(n, 8, 10)); // 2 travel days

      const reconfirms = getPendingConfirmations().filter(
        (c) => (c as { reconfirm?: boolean }).reconfirm === true
      );
      expect(reconfirms).toHaveLength(0);
    });

    it('does not re-emit when the station was visited recently', () => {
      for (const n of [20, 19, 18]) logSessionStart('st-home', daysAgoAt(n, 8, 5));
      confirmHomeAt('st-home');
      for (const n of [10, 7, 3]) logSessionStart('st-other', daysAgoAt(n, 8, 10));
      logSessionStart('st-home', daysAgoAt(2, 8, 5)); // visited 2 days ago

      const reconfirms = getPendingConfirmations().filter(
        (c) => (c as { reconfirm?: boolean }).reconfirm === true
      );
      expect(reconfirms).toHaveLength(0);
    });

    it('emits at most once per silent stretch', () => {
      for (const n of [20, 19, 18]) logSessionStart('st-home', daysAgoAt(n, 8, 5));
      confirmHomeAt('st-home');
      for (const n of [10, 7, 3, 1]) logSessionStart('st-other', daysAgoAt(n, 8, 10));

      const first = getPendingConfirmations().filter(
        (c) => (c as { reconfirm?: boolean }).reconfirm === true
      );
      const second = getPendingConfirmations().filter(
        (c) => (c as { reconfirm?: boolean }).reconfirm === true
      );
      expect(first).toHaveLength(1);
      expect(second).toHaveLength(0);
    });
  });

  describe('confirmConfirmation', () => {
    it('sets the pinned-station role via existing store semantics', () => {
      for (const n of [6, 4, 2]) logSessionStart('st-a', daysAgoAt(n, 8, 5));
      const proposal = stationConfirmations()[0];
      useUserPreferencesStore.setState({
        pinnedStations: [{ id: 'st-a', name: 'A', lines: [], zone: 1, role: 'other' }],
      });
      confirmConfirmation(proposal);
      const pinned = useUserPreferencesStore.getState().pinnedStations;
      expect(pinned.find((s) => s.id === 'st-a')?.role).toBe('home');
    });

    it('moves the role off a previous holder (existing setStationRole semantics)', () => {
      for (const n of [6, 4, 2]) logSessionStart('st-a', daysAgoAt(n, 8, 5));
      const proposal = stationConfirmations()[0];
      useUserPreferencesStore.setState({
        pinnedStations: [
          { id: 'st-old', name: 'Old', lines: [], zone: 1, role: 'home' },
          { id: 'st-a', name: 'A', lines: [], zone: 1, role: 'other' },
        ],
      });
      confirmConfirmation(proposal);
      const pinned = useUserPreferencesStore.getState().pinnedStations;
      expect(pinned.find((s) => s.id === 'st-a')?.role).toBe('home');
      expect(pinned.find((s) => s.id === 'st-old')?.role).toBe('other');
    });

    it('pins an unpinned station with the inferred role', () => {
      for (const n of [6, 4, 2]) logSessionStart('HUBLST', daysAgoAt(n, 8, 5));
      const proposal = stationConfirmations()[0];
      confirmConfirmation(proposal);
      const pinned = useUserPreferencesStore.getState().pinnedStations;
      // pinStation resolves HUB codes to NaPTAN ids (existing store semantics),
      // so match on the inferred role + coordinates-derived name.
      const tagged = pinned.find((s) => s.role === 'home');
      expect(tagged).toBeDefined();
      expect(tagged!.name).toBe('Liverpool Street');
    });

    it('writes the inferred alert window via setAlertHours', () => {
      logSessionStart('st-a', daysAgoAt(6, 8, 0));
      logSessionStart('st-b', daysAgoAt(4, 8, 20));
      logSessionStart('st-c', daysAgoAt(2, 8, 50));
      const hours = getPendingConfirmations().find((c) => c.type === 'hours')!;
      confirmConfirmation(hours);
      const state = useUserPreferencesStore.getState();
      expect(state.alertWindowStart).toBe('07:45');
      expect(state.alertWindowEnd).toBe('09:30');
    });
  });

  describe('undoLastConfirmation', () => {
    it('restores the previous role when undone within 5s', () => {
      jest.useFakeTimers();
      const base = Date.now();
      jest.setSystemTime(base);
      useUserPreferencesStore.setState({
        pinnedStations: [{ id: 'st-a', name: 'A', lines: [], zone: 1, role: 'other' }],
      });
      confirmConfirmation({ type: 'home', stationId: 'st-a', stationName: 'A' });
      expect(useUserPreferencesStore.getState().pinnedStations[0].role).toBe('home');

      jest.setSystemTime(base + 4000);
      undoLastConfirmation();
      expect(useUserPreferencesStore.getState().pinnedStations[0].role).toBe('other');
    });

    it('is a no-op after 5s', () => {
      jest.useFakeTimers();
      const base = Date.now();
      jest.setSystemTime(base);
      useUserPreferencesStore.setState({
        pinnedStations: [{ id: 'st-a', name: 'A', lines: [], zone: 1, role: 'other' }],
      });
      confirmConfirmation({ type: 'home', stationId: 'st-a', stationName: 'A' });

      jest.setSystemTime(base + 6000);
      undoLastConfirmation();
      expect(useUserPreferencesStore.getState().pinnedStations[0].role).toBe('home');
    });

    it('unpins a station this engine pinned when undone within 5s', () => {
      jest.useFakeTimers();
      const base = Date.now();
      jest.setSystemTime(base);
      confirmConfirmation({ type: 'home', stationId: 'HUBLST', stationName: 'Liverpool Street' });
      expect(useUserPreferencesStore.getState().pinnedStations).toHaveLength(1);

      jest.setSystemTime(base + 1000);
      undoLastConfirmation();
      expect(useUserPreferencesStore.getState().pinnedStations).toHaveLength(0);
    });

    it('restores previous alert hours when undone within 5s', () => {
      jest.useFakeTimers();
      const base = Date.now();
      jest.setSystemTime(base);
      confirmConfirmation({ type: 'hours', windowStart: '07:45', windowEnd: '09:30' });
      expect(useUserPreferencesStore.getState().alertWindowStart).toBe('07:45');

      jest.setSystemTime(base + 2000);
      undoLastConfirmation();
      const state = useUserPreferencesStore.getState();
      expect(state.alertWindowStart).toBe('06:00');
      expect(state.alertWindowEnd).toBe('22:00');
    });
  });

  describe('dismissConfirmation backoff', () => {
    it('suppresses the type for 7d after 3 dismissals in a rolling 7d window', () => {
      jest.useFakeTimers();
      const base = Date.now();
      for (const n of [6, 4, 2]) logSessionStart('st-a', daysAgoAt(n, 8, 5));
      const proposal = stationConfirmations()[0];

      jest.setSystemTime(base);
      dismissConfirmation(proposal);
      jest.setSystemTime(base + 1000);
      dismissConfirmation(proposal);
      expect(stationConfirmations()).toHaveLength(1); // only 2 -> not suppressed

      jest.setSystemTime(base + 2000);
      dismissConfirmation(proposal);
      expect(stationConfirmations()).toHaveLength(0); // 3 -> suppressed 7d
    });

    it('suppression expires after 7d', () => {
      jest.useFakeTimers();
      const base = Date.now();
      for (const n of [6, 4, 2]) logSessionStart('st-a', daysAgoAt(n, 8, 5));
      const proposal = stationConfirmations()[0];

      jest.setSystemTime(base);
      dismissConfirmation(proposal);
      jest.setSystemTime(base + 1000);
      dismissConfirmation(proposal);
      jest.setSystemTime(base + 2000);
      dismissConfirmation(proposal);
      expect(stationConfirmations()).toHaveLength(0);

      jest.setSystemTime(base + 8 * DAY_MS);
      expect(stationConfirmations()).toHaveLength(1); // suppression + dismissals expired
    });

    it('dismissals older than 7d do not count toward the backoff', () => {
      jest.useFakeTimers();
      const base = Date.now();
      for (const n of [6, 4, 2]) logSessionStart('st-a', daysAgoAt(n, 8, 5));
      const proposal = stationConfirmations()[0];

      jest.setSystemTime(base - 8 * DAY_MS);
      dismissConfirmation(proposal);
      jest.setSystemTime(base - 8 * DAY_MS + 1000);
      dismissConfirmation(proposal);
      jest.setSystemTime(base);
      dismissConfirmation(proposal);
      // Only 1 dismissal inside the rolling window -> no suppression.
      expect(stationConfirmations()).toHaveLength(1);
    });

    it('backoff is per confirmation type', () => {
      jest.useFakeTimers();
      const base = Date.now();
      for (const n of [6, 4, 2]) logSessionStart('st-a', daysAgoAt(n, 8, 5));
      logSessionStart('st-x', daysAgoAt(6, 8, 0));
      logSessionStart('st-y', daysAgoAt(4, 8, 20));
      logSessionStart('st-z', daysAgoAt(2, 8, 50));

      const station = stationConfirmations()[0];
      jest.setSystemTime(base);
      dismissConfirmation(station);
      jest.setSystemTime(base + 1000);
      dismissConfirmation(station);
      jest.setSystemTime(base + 2000);
      dismissConfirmation(station);

      expect(stationConfirmations()).toHaveLength(0);
      // Hours type is unaffected.
      expect(getPendingConfirmations().filter((c) => c.type === 'hours')).toHaveLength(1);
    });
  });

  describe('getStationScores', () => {
    it('counts observations per station in the trailing 30d', () => {
      logSessionStart('st-a', daysAgoAt(6, 8, 5));
      logSessionStart('st-a', daysAgoAt(4, 8, 5));
      logSessionStart('st-b', daysAgoAt(2, 8, 5));
      logSessionStart('st-b', Date.now() - 40 * DAY_MS); // pruned
      expect(getStationScores()).toEqual({ 'st-a': 2, 'st-b': 1 });
    });
  });

  describe('assumption reveal', () => {
    function pinForReveal(
      stations: { id: string; name: string; role?: 'home' | 'work' | 'other' }[],
      opts: { onboarded?: boolean; revealed?: boolean } = {},
    ): void {
      useUserPreferencesStore.setState({
        hasCompletedOnboarding: opts.onboarded ?? true,
        assumptionRevealed: opts.revealed ?? false,
        pinnedStations: stations.map((s) => ({
          id: s.id,
          name: s.name,
          lines: [] as string[],
          zone: 1,
          role: s.role ?? 'other',
        })),
      });
    }

    it('returns null before onboarding completes (pin order not final)', () => {
      pinForReveal(
        [{ id: 'st-bank', name: 'Bank' }],
        { onboarded: false },
      );
      expect(getAssumptionReveal()).toBeNull();
    });

    it('returns null with no pinned stations', () => {
      pinForReveal([]);
      expect(getAssumptionReveal()).toBeNull();
    });

    it('returns null when an explicit home/work role exists', () => {
      pinForReveal([
        { id: 'st-bank', name: 'Bank', role: 'home' },
        { id: 'st-strat', name: 'Stratford' },
      ]);
      expect(getAssumptionReveal()).toBeNull();
    });

    it('returns null once the reveal was retired', () => {
      pinForReveal([{ id: 'st-bank', name: 'Bank' }], { revealed: true });
      expect(getAssumptionReveal()).toBeNull();
    });

    it('reveals home + work from pin order', () => {
      pinForReveal([
        { id: 'st-bank', name: 'Bank' },
        { id: 'st-strat', name: 'Stratford' },
      ]);
      expect(getAssumptionReveal()).toEqual({ homeName: 'Bank', workName: 'Stratford' });
    });

    it('reveals home only with a single pinned station', () => {
      pinForReveal([{ id: 'st-bank', name: 'Bank' }]);
      expect(getAssumptionReveal()).toEqual({ homeName: 'Bank', workName: null });
    });

    it('markAssumptionRevealed retires the reveal permanently', () => {
      pinForReveal([{ id: 'st-bank', name: 'Bank' }]);
      expect(getAssumptionReveal()).not.toBeNull();
      markAssumptionRevealed();
      expect(useUserPreferencesStore.getState().assumptionRevealed).toBe(true);
      expect(getAssumptionReveal()).toBeNull();
    });

    it('returns null once the inference engine has engaged', () => {
      pinForReveal([
        { id: 'st-bank', name: 'Bank' },
        { id: 'st-strat', name: 'Stratford' },
      ]);
      // Engine engages: 3 observations -> a real confirmation exists.
      for (const n of [6, 4, 2]) logSessionStart('st-a', daysAgoAt(n, 8, 5));
      expect(stationConfirmations()).toHaveLength(1);
      dismissConfirmation(stationConfirmations()[0]);
      // The fallback assumption is now obsolete — the real conversation won.
      expect(getAssumptionReveal()).toBeNull();
    });
  });
});
