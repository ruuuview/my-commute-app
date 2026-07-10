import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';

import { resolveTflStopIdForStore } from '../utils/resolveTflStopId';

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
}

interface OnboardingStore {
  // Screen 1
  selectedLines: string[];
  toggleLine: (lineId: string) => void;

  // Screen 2
  pinnedStations: Station[];
  addStation: (station: Station) => void;
  removeStation: (stationId: string) => void;

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
          if (!includes && s.selectedLines.length >= 5) {
            return s;
          }
          return {
            selectedLines: includes
               ? s.selectedLines.filter((id) => id !== lineId)
               : [...s.selectedLines, lineId],
          };
        }),

      addStation: (station) =>
        set((s) => {
          const resolvedId = resolveTflStopIdForStore(station.id);
          if (s.pinnedStations.find((p) => p.id === resolvedId)) return s;
          if (s.pinnedStations.length >= 5) return s;
          return { pinnedStations: [...s.pinnedStations, { ...station, id: resolvedId }] };
        }),

      removeStation: (stationId) =>
        set((s) => ({
          pinnedStations: s.pinnedStations.filter((p) => p.id !== stationId),
        })),

      setNavigationDirection: (dir) => set({ navigationDirection: dir }),

      reset: () => set({ selectedLines: [], pinnedStations: [], navigationDirection: 'forward' }),
    }),
    {
      name: 'onboarding-store',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        selectedLines: state.selectedLines,
        pinnedStations: state.pinnedStations,
      }),
    }
  )
);
