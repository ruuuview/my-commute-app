import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';

// ─── Storage: MMKV with AsyncStorage fallback ─────────────────────
// MMKV requires a native dev build. In Expo Go it crashes on import.
// We lazy-require it inside a try/catch so Expo Go falls back to
// AsyncStorage automatically — no code change needed when you switch builds.
function buildStorage(): StateStorage {
  try {
    const { MMKV } = require('react-native-mmkv');
    const mmkv = new MMKV({ id: 'user-preferences-v2' });
    console.log('[Storage] Using MMKV ✅');
    return {
      getItem: (key) => mmkv.getString(key) ?? null,
      setItem: (key, value) => mmkv.set(key, value),
      removeItem: (key) => mmkv.delete(key),
    };
  } catch {
    console.log('[Storage] MMKV unavailable — falling back to AsyncStorage');
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    return {
      getItem: (key) => AsyncStorage.getItem(key),
      setItem: (key, value) => AsyncStorage.setItem(key, value),
      removeItem: (key) => AsyncStorage.removeItem(key),
    };
  }
}

const storage = buildStorage();

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

      clearAll: () => set({
        selectedLineIds: [],
        selectedStationIds: [],
        pinnedStations: [],
        hasCompletedOnboarding: false,
        onboardingStep: 0,
      }),

      completeOnboarding: () => set({ hasCompletedOnboarding: true, onboardingStep: 3 }),

      setOnboardingStep: (step) => set({ onboardingStep: step }),

      pinStation: (station) =>
        set((s) => {
          if (s.pinnedStations.length >= 4) return s;
          const existingIndex = s.pinnedStations.findIndex((p) => p.id === station.id);
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
      name: 'user-preferences-v2',
      storage: createJSONStorage(() => storage),
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