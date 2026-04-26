import { MMKV } from 'react-native-mmkv';
import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';

// @ts-ignore
const storage = new MMKV({ id: 'user-preferences' });

const mmkvStorage: StateStorage = {
  getItem: (key) => storage.getString(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
};

export interface UserPreferencesState {
  selectedLineIds: string[];
  selectedStationIds: string[];
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
}

export const useUserPreferences = create<UserPreferencesState>()(
  persist(
    (set, get) => ({
      selectedLineIds: [],
      selectedStationIds: [],

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

      clearAll: () => set({ selectedLineIds: [], selectedStationIds: [] }),
    }),
    {
      name: 'user-preferences', 
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (s) => ({
        selectedLineIds: s.selectedLineIds,
        selectedStationIds: s.selectedStationIds,
      }),
    }
  )
);

export const selectLineIds = (s: UserPreferencesState) => s.selectedLineIds;
export const selectStationIds = (s: UserPreferencesState) => s.selectedStationIds;
export const selectHasLine = (id: string) => (s: UserPreferencesState) => s.selectedLineIds.includes(id);
export const selectHasStation = (id: string) => (s: UserPreferencesState) => s.selectedStationIds.includes(id);