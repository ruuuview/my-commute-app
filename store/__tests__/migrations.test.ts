// store/__tests__/migrations.test.ts
import { runMigrations, STORE_VERSION, MIGRATIONS } from '../migrations';

declare const describe: any;
declare const it: any;
declare const expect: any;

describe('Storage Migrations Pipeline', () => {
  it('should sequentially execute v1 -> v3 migrations', () => {
    const v1State = {
      pinnedStations: [
        { id: 'HUBKGX', name: "King's Cross", lines: ['victoria'], zone: 1, role: 'home' },
        { id: '940GZZLUEUS', name: 'Euston', lines: ['victoria', 'northern'], zone: 1, role: 'work' },
      ],
      tflRegistered: true, // Legacy false optimistic flag
      selectedLines: ['victoria', 'northern'],
    };

    const migrated = runMigrations(v1State, 1, 3);

    // v2 expectation: HUBKGX resolved to 940GZZLUKSX
    expect(migrated.pinnedStations[0].id).toBe('940GZZLUKSX');
    expect(migrated.pinnedStations[1].id).toBe('940GZZLUEUS');

    // v3 expectation: tflRegistered reset to honest false
    expect(migrated.tflRegistered).toBe(false);

    // Untouched properties preserved
    expect(migrated.selectedLines).toEqual(['victoria', 'northern']);
  });

  it('should correctly run v2 -> v3 migration without altering already resolved IDs', () => {
    const v2State = {
      pinnedStations: [{ id: '940GZZLUKSX', name: "King's Cross", lines: ['victoria'], zone: 1, role: 'home' }],
      tflRegistered: true,
    };

    const migrated = runMigrations(v2State, 2, 3);

    expect(migrated.pinnedStations[0].id).toBe('940GZZLUKSX');
    expect(migrated.tflRegistered).toBe(false);
  });

  it('should ignore TestFlight / future downgrades if fromVersion >= targetVersion', () => {
    const v4State = {
      customFutureKey: 'future-feature-token',
      tflRegistered: true,
      pinnedStations: [],
    };

    const result = runMigrations(v4State, 4, 3);
    expect(result).toEqual(v4State);
    expect(result.tflRegistered).toBe(true);
  });

  it('should return null or undefined as-is if persistedState is falsy', () => {
    expect(runMigrations(null, 1, STORE_VERSION)).toBeNull();
    expect(runMigrations(undefined, 1, STORE_VERSION)).toBeUndefined();
  });

  it('should gracefully handle corrupt or malformed pinnedStations payload without throwing', () => {
    const corruptState = {
      pinnedStations: null,
      tflRegistered: true,
    };

    let result: any;
    expect(() => {
      result = runMigrations(corruptState, 1, STORE_VERSION);
    }).not.toThrow();

    expect(result.tflRegistered).toBe(false);
    expect(Array.isArray(result.pinnedStations)).toBe(true);
  });

  it('should safely recover and return original state if an unexpected error occurs during migration', () => {
    const throwingState = { test: 123 };
    // Temporarily inject a throwing migration step
    const originalStep = MIGRATIONS[3];
    (MIGRATIONS as any)[3] = () => {
      throw new Error('Simulated disk error');
    };

    let result: any;
    expect(() => {
      result = runMigrations(throwingState, 2, 3);
    }).not.toThrow();

    expect(result).toEqual(throwingState);

    // Restore original step
    MIGRATIONS[3] = originalStep;
  });
});
