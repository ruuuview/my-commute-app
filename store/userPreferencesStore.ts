// store/userPreferencesStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';

const storage = createMMKV();

const mmkvStorageAdapter: StateStorage = {
  setItem: (name, value) => {
    storage.set(name, value);
  },
  getItem: (name) => {
    const value = storage.getString(name);
    return value ?? null;
  },
  removeItem: (name) => {
    storage.remove(name);
  },
};

interface UserPreferencesState {
  schemaVersion: number;
  hasCompletedOnboarding: boolean;
  onboardingStep: 0 | 1 | 2 | 3;
  selectedLines: string[];
  pinnedStations: { id: string; name: string; lines: string[]; role: 'home' | 'work' | 'other' }[];
  notificationsGranted: boolean;
  trialStartDate: string | null;
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
  completeOnboarding: () => void;
  toggleLine: (id: string) => void;
  pinStation: (station: { id: string; name: string; lines: string[] }, role: 'home' | 'work' | 'other') => void;
  unpinStation: (id: string) => void;
  reorderLines: (order: string[]) => void;
  reorderStations: (order: { id: string; name: string; lines: string[]; role: 'home' | 'work' | 'other' }[]) => void;
}

const initialState: Omit<UserPreferencesState, 'setHasHydrated' | 'completeOnboarding' | 'toggleLine' | 'pinStation' | 'unpinStation' | 'reorderLines' | 'reorderStations'> = {
  schemaVersion: 1,
  hasCompletedOnboarding: false,
  onboardingStep: 0,
  selectedLines: [],
  pinnedStations: [],
  notificationsGranted: false,
  trialStartDate: null,
  _hasHydrated: false,
};

export const useUserPreferencesStore = create<UserPreferencesState>()(
  persist(
    (set) => ({
      ...initialState,
      setHasHydrated: (state) => set({ _hasHydrated: state }),
      completeOnboarding: () => set({ hasCompletedOnboarding: true, onboardingStep: 3 }),
      toggleLine: (id: string) => {
        set(state => {
          const lines = [...state.selectedLines];
          if (lines.includes(id)) {
            lines.splice(lines.indexOf(id), 1);
          } else {
            lines.push(id);
          }
          if (lines.length > 5) {
            lines.shift();
          }
          return { selectedLines: lines };
        });
      },
      pinStation: (station: { id: string; name: string; lines: string[] }, role: 'home' | 'work' | 'other') => {
        set(state => {
          const stations = [...state.pinnedStations];
          if (stations.length < 5) {
            stations.push({ ...station, role });
            return { pinnedStations: stations };
          }
          return state;
        });
      },
      unpinStation: (id: string) => {
        set(state => {
          const stations = [...state.pinnedStations];
          const index = stations.findIndex(s => s.id === id);
          if (index !== -1) {
            stations.splice(index, 1);
            return { pinnedStations: stations };
          }
          return state;
        });
      },
      reorderLines: (order: string[]) => {
        set({ selectedLines: order });
      },
      reorderStations: (order: { id: string; name: string; lines: string[]; role: 'home' | 'work' | 'other' }[]) => {
        set({ pinnedStations: order });
      }
    }),
    {
      name: 'user-preferences',
      version: 1,
      storage: createJSONStorage(() => mmkvStorageAdapter),
      partialize: (state) => {
        const { _hasHydrated, setHasHydrated, ...persisted } = state;
        return persisted;
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
