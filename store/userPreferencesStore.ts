import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';

let storage: any = null;
const getStorage = () => {
  if (storage) return storage;
  // Lazy-load to avoid JSI/TurboModule init at module import time
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { MMKV } = require('react-native-mmkv');
  storage = new MMKV({ id: 'user-preferences' });
  return storage;
};

const mmkvStorage: StateStorage = {
  getItem: (key) => {
    const storage = getStorage();
    return storage.getString(key) ?? null;
  },
  setItem: (key, value) => {
    const storage = getStorage();
    storage.set(key, value);
  },
  removeItem: (key) => {
    const storage = getStorage();
    storage.delete(key);
  },
};

export interface PinnedStation {
  id: string;
  name: string;
  lines: string[];
  role: 'home' | 'work' | 'other';
}

export interface UserPreferencesState {
  selectedLineIds: string[];
  selectedStationIds: string[];
  hasCompletedOnboarding: boolean;
  onboardingStep: number;
  pinnedStations: PinnedStation[];
  addLine: (id: string) => void;
  removeLine: (id: string) => void;
  toggleLine: (id: string) => void;
  setLines: (ids: string[]) => void;
  addStation: (id: string) => void;
  removeStation: (id: string) => void;
  toggleStation: (id: string) => void;
  setStations: (ids: string[]) => void;
  reorderLines: (from: number, to: number) => void;
  reorderStations: (from: number, to: number) => void;
  clearAll: () => void;
  completeOnboarding: () => void;
  setOnboardingStep: (step: number) => void;
  pinStation: (station: PinnedStation) => void;
  removePinnedStation: (id: string) => void;
  clearPinnedStations: () => void;
}

export const useUserPreferences = create<UserPreferencesState>()(
  persist(
    (set, get) => ({
      selectedLineIds: [],
      selectedStationIds: [],
      hasCompletedOnboarding: false,
      onboardingStep: 0,
      pinnedStations: [],

      addLine: (id) =>
        set((s) => s.selectedLineIds.includes(id) ? s : { selectedLineIds: [...s.selectedLineIds, id] }),

      removeLine: (id) =>
        set((s) => ({ selectedLineIds: s.selectedLineIds.filter((l) => l !== id) })),

      toggleLine: (id) => {
        const { selectedLineIds, addLine, removeLine } = get();
        selectedLineIds.includes(id) ? removeLine(id) : addLine(id);
      },

      setLines: (ids) => set({ selectedLineIds: ids }),

      addStation: (id) =>
        set((s) => s.selectedStationIds.includes(id) ? s : { selectedStationIds: [...s.selectedStationIds, id] }),

      removeStation: (id) =>
        set((s) => ({ selectedStationIds: s.selectedStationIds.filter((st) => st !== id) })),

      toggleStation: (id) => {
        const { selectedStationIds, addStation, removeStation } = get();
        selectedStationIds.includes(id) ? removeStation(id) : addStation(id);
      },

      setStations: (ids) => set({ selectedStationIds: ids }),

      reorderLines: (from, to) =>
        set((s) => {
          const arr = [...s.selectedLineIds];
          const [moved] = arr.splice(from, 1);
          arr.splice(to, 0, moved);
          return { selectedLineIds: arr };
        }),

      reorderStations: (from, to) =>
        set((s) => {
          const arr = [...s.selectedStationIds];
          const [moved] = arr.splice(from, 1);
          arr.splice(to, 0, moved);
          return { selectedStationIds: arr };
        }),

      clearAll: () => set({ selectedLineIds: [], selectedStationIds: [], pinnedStations: [] }),
      
      completeOnboarding: () => set({ hasCompletedOnboarding: true, onboardingStep: 3 }),
      
      setOnboardingStep: (step) => set({ onboardingStep: step }),
      
      pinStation: (station) =>
        set((s) => {
          if (s.pinnedStations.length >= 4) {
            return s;
          }
          const existingIndex = s.pinnedStations.findIndex((s) => s.id === station.id);
          if (existingIndex >= 0) {
            const updated = [...s.pinnedStations];
            updated[existingIndex] = station;
            return { pinnedStations: updated };
          }
          return { pinnedStations: [...s.pinnedStations, station] };
        }),
      
      removePinnedStation: (id) =>
        set((s) => ({
          pinnedStations: s.pinnedStations.filter((station) => station.id !== id),
        })),
      
      clearPinnedStations: () => set({ pinnedStations: [] }),
    }),
    {
      name: 'user-preferences', 
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (s) => ({
        selectedLineIds: s.selectedLineIds,
        selectedStationIds: s.selectedStationIds,
        hasCompletedOnboarding: s.hasCompletedOnboarding,
        onboardingStep: s.onboardingStep,
        pinnedStations: s.pinnedStations,
      }),
    }
  )
);

export const selectLineIds = (s: UserPreferencesState) => s.selectedLineIds;
export const selectStationIds = (s: UserPreferencesState) => s.selectedStationIds;
export const selectHasLine = (id: string) => (s: UserPreferencesState) => s.selectedLineIds.includes(id);
export const selectHasStation = (id: string) => (s: UserPreferencesState) => s.selectedStationIds.includes(id);