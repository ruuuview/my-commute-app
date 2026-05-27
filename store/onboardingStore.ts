import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';

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

  // Reset
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set) => ({
      selectedLines: [],
      pinnedStations: [],

      toggleLine: (lineId) =>
        set((s) => ({
          selectedLines: s.selectedLines.includes(lineId)
            ? s.selectedLines.filter((id) => id !== lineId)
            : [...s.selectedLines, lineId],
        })),

      addStation: (station) =>
        set((s) => {
          if (s.pinnedStations.find((p) => p.id === station.id)) return s;
          if (s.pinnedStations.length >= 5) return s;
          return { pinnedStations: [...s.pinnedStations, station] };
        }),

      removeStation: (stationId) =>
        set((s) => ({
          pinnedStations: s.pinnedStations.filter((p) => p.id !== stationId),
        })),

      reset: () => set({ selectedLines: [], pinnedStations: [] }),
    }),
    {
      name: 'onboarding-store',
      storage: createJSONStorage(() => mmkvStorage),
    }
  )
);
