// store/migrations.ts
import { resolveTflStopIdForStore } from '../utils/resolveTflStopId';

export type MigrationFn = (persistedState: Record<string, any>) => Record<string, any>;

export const STORE_VERSION = 3;

export const MIGRATIONS: Record<number, MigrationFn> = {
  2: (state) => ({
    ...state,
    pinnedStations: Array.isArray(state?.pinnedStations)
      ? state.pinnedStations.map((station: any) => ({
          ...station,
          id: typeof station?.id === 'string'
            ? resolveTflStopIdForStore(station.id)
            : station?.id,
        }))
      : [],
  }),
  3: (state) => ({
    ...state,
    tflRegistered: false, // Reset legacy false optimistic state to honest default
  }),
};

export function runMigrations(
  persistedState: any,
  fromVersion: number,
  targetVersion: number = STORE_VERSION
): any {
  // 1. Future version / TestFlight downgrade protection
  if (!persistedState || fromVersion >= targetVersion) {
    return persistedState;
  }

  let state = { ...persistedState };

  // 2. Sequential execution with crash-resilience
  try {
    for (let v = fromVersion; v < targetVersion; v++) {
      const nextVersion = v + 1;
      const step = MIGRATIONS[nextVersion];
      if (typeof step === 'function') {
        state = step(state);
      }
    }
    return state;
  } catch (error) {
    console.error(`[Storage Migration] Failed from v${fromVersion} to v${targetVersion}:`, error);
    // Return existing persisted state so the app opens safely rather than crashing on launch
    return persistedState;
  }
}
