import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';

import { resolveTflStopIdForStore } from '../utils/resolveTflStopId';
import { sanitiseStationName } from '../data/tflStations';

const storage = createMMKV({ id: 'onboarding' });

const mmkvStorage = {
  getItem: (key: string) => storage.getString(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.remove(key),
};

export interface Station {
  id: string;
  name: string;
  lineIds: string[];
  zone: number;
  // Explicit home/work assignment during onboarding (Phase 3). Optional:
  // when unset, the stations screen CTA falls back to index-based roles
  // (first pinned = home, second = work) exactly as before.
  role?: 'home' | 'work' | 'other';
}

interface OnboardingStore {
  // Screen 1
  selectedLines: string[];
  toggleLine: (lineId: string) => void;

  // Screen 2
  pinnedStations: Station[];
  addStation: (station: Station) => void;
  removeStation: (stationId: string) => void;
  setStationRole: (stationId: string, role: 'home' | 'work' | 'other') => void;

  // Navigation Direction
  navigationDirection: 'forward' | 'backward';
  setNavigationDirection: (dir: 'forward' | 'backward') => void;

  // Reset
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set) => ({
      selectedLines: [],
      pinnedStations: [],
      navigationDirection: 'forward',

      toggleLine: (lineId) =>
        set((s) => {
          const includes = s.selectedLines.includes(lineId);
          return {
            selectedLines: includes
               ? s.selectedLines.filter((id) => id !== lineId)
               : [...s.selectedLines, lineId],
          };
        }),

      addStation: (station) =>
        set((s) => {
          const resolvedId = resolveTflStopIdForStore(station.id);
          const cleanName = sanitiseStationName(station.name);
          if (s.pinnedStations.some((p) => p.id === resolvedId || resolveTflStopIdForStore(p.id) === resolvedId || sanitiseStationName(p.name) === cleanName)) {
            return s;
          }
          return { pinnedStations: [...s.pinnedStations, { ...station, id: resolvedId }] };
        }),

      removeStation: (stationId) =>
        set((s) => {
          const resolvedId = resolveTflStopIdForStore(stationId);
          return {
            pinnedStations: s.pinnedStations.filter((p) => p.id !== stationId && resolveTflStopIdForStore(p.id) !== resolvedId),
          };
        }),

      setNavigationDirection: (dir) => set({ navigationDirection: dir }),

      // Same swap semantics as userPreferencesStore.setStationRole: assigning
      // 'home'/'work' clears that role from any other station.
      setStationRole: (stationId, role) =>
        set((s) => {
          const resolvedId = resolveTflStopIdForStore(stationId);
          return {
            pinnedStations: s.pinnedStations.map((p) => {
              const isTarget = p.id === stationId || resolveTflStopIdForStore(p.id) === resolvedId;
              if (isTarget) return { ...p, role };
              if ((role === 'home' || role === 'work') && p.role === role) {
                return { ...p, role: 'other' as const };
              }
              return p;
            }),
          };
        }),

      reset: () => set({ selectedLines: [], pinnedStations: [], navigationDirection: 'forward' }),
    }),
    {
      name: 'onboarding-store',
      version: 1,
      migrate: (persisted: any, version: number) => {
        return persisted;
      },
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        selectedLines: state.selectedLines,
        pinnedStations: state.pinnedStations,
      }),
    }
  )
);
