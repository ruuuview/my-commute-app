import {
  getCachedArrivals,
  setCachedArrivals,
  deleteCachedArrivals,
  resetArrivalsStoreForTesting,
  fetchOnce,
} from '../services/stationArrivalsStore';
import * as apiService from '../services/apiService';

jest.mock('../services/apiService', () => ({
  fetchNormalizedStationArrivals: jest.fn(),
}));

describe('Pull-to-Refresh & Silent Revalidation Architectural Invariants', () => {
  const stationId = '940GZZLUBNK';
  const mockArrivals = [
    {
      id: 'dep-1',
      lineId: 'central',
      lineName: 'Central',
      destination: 'Epping',
      minutes_away: 2,
      platform: 'Platform 6',
      status: 'On time',
      lineColor: '#E32012',
    },
  ];

  beforeEach(() => {
    resetArrivalsStoreForTesting();
    deleteCachedArrivals(stationId);
    jest.clearAllMocks();
  });

  it('Invariant #2: Synchronous cache retrieval is instantaneous on Frame 0', () => {
    expect(getCachedArrivals(stationId)).toBeUndefined();
    setCachedArrivals(stationId, mockArrivals as any);
    // Instant synchronous read without promise resolution
    const cached = getCachedArrivals(stationId);
    expect(cached).toBeDefined();
    expect(cached).toEqual(mockArrivals);
  });

  it('Invariant #5: Stale data preservation — revalidation failure NEVER clears existing cached arrivals', async () => {
    // 1. Seed cache with valid arrivals
    setCachedArrivals(stationId, mockArrivals as any);

    // 2. Mock a failed background revalidation (network error / 500)
    (apiService.fetchNormalizedStationArrivals as jest.Mock).mockRejectedValueOnce(
      new Error('TfL 503 Service Unavailable')
    );

    // 3. Trigger fetchOnce with force = true
    const result = await fetchOnce(stationId, undefined, true);

    // 4. Assert existing cached data is preserved and returned, NOT wiped to empty []
    expect(result).toEqual(mockArrivals);
    expect(getCachedArrivals(stationId)).toEqual(mockArrivals);
  });

  it('Invariant #6: Race condition & single-flight deduplication ensures concurrent fetches reuse same in-flight promise', async () => {
    let callCount = 0;
    (apiService.fetchNormalizedStationArrivals as jest.Mock).mockImplementation(
      () =>
        new Promise(resolve => {
          callCount++;
          setTimeout(() => resolve({ departures: mockArrivals }), 20);
        })
    );

    // Fire 2 concurrent fetches for the same station
    const [res1, res2] = await Promise.all([
      fetchOnce(stationId, undefined, true),
      fetchOnce(stationId, undefined, true),
    ]);

    expect(callCount).toBe(1);
    expect(res1).toEqual(mockArrivals);
    expect(res2).toEqual(mockArrivals);
  });
});
