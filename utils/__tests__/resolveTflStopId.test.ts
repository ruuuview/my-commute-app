// utils/__tests__/resolveTflStopId.test.ts
import { resolveTflStopIds, resolveTflStopIdForStore } from '../resolveTflStopId';
import { FULL_STATIONS, POPULAR_STATIONS } from '../../data/tflStations';
import hubExpansions from '../../data/hubExpansions.json';

describe('resolveTflStopId & Full Station Dataset Audit', () => {
  it('resolves every station in FULL_STATIONS (489 stations) to valid NaPTAN IDs', () => {
    expect(FULL_STATIONS.length).toBeGreaterThan(400);

    for (const station of FULL_STATIONS) {
      const ids = resolveTflStopIds(station.id);
      expect(Array.isArray(ids)).toBe(true);
      expect(ids.length).toBeGreaterThan(0);

      for (const id of ids) {
        expect(typeof id).toBe('string');
        expect(id.trim().length).toBeGreaterThan(0);
        // Every resolved ID must be either a TfL Tube/DLR/Tram/Bus StopPoint (940G...) or Rail (910G...)
        expect(id.startsWith('940G') || id.startsWith('910G')).toBe(true);
      }

      const storeId = resolveTflStopIdForStore(station.id);
      expect(typeof storeId).toBe('string');
      expect(storeId.trim().length).toBeGreaterThan(0);
      expect(storeId.startsWith('940G') || storeId.startsWith('910G')).toBe(true);
    }
  });

  it('resolves every station in POPULAR_STATIONS to valid NaPTAN IDs', () => {
    expect(POPULAR_STATIONS.length).toBeGreaterThan(10);

    for (const station of POPULAR_STATIONS) {
      const ids = resolveTflStopIds(station.id);
      expect(Array.isArray(ids)).toBe(true);
      expect(ids.length).toBeGreaterThan(0);

      const storeId = resolveTflStopIdForStore(station.id);
      expect(typeof storeId).toBe('string');
      expect(storeId.startsWith('940G') || storeId.startsWith('910G')).toBe(true);
    }
  });

  it('resolves all Hub Expansion codes to valid NaPTAN arrays', () => {
    const hubKeys = Object.keys(hubExpansions);
    expect(hubKeys.length).toBeGreaterThan(20);

    for (const hubKey of hubKeys) {
      const ids = resolveTflStopIds(hubKey);
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) {
        expect(id.startsWith('940G') || id.startsWith('910G')).toBe(true);
      }
    }
  });
});
