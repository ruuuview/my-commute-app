// store/userPreferencesStore.ts
import create from 'zustand';
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV();

interface UserPreferencesState {
  schemaVersion: number;
  hasCompletedOnboarding: boolean;
  onboardingStep: 0 | 1 | 2 | 3;
  selectedLines: string[];
  pinnedStations: { id: string; name: string; lines: string[]; role: 'home' | 'work' | 'other' }[];
  notificationsGranted: boolean;
  trialStartDate: string | null;
}

const initialState: UserPreferencesState = {
  schemaVersion: 1,
  hasCompletedOnboarding: storage.getBoolean('@mc:hasCompletedOnboarding') || false,
  onboardingStep: storage.getNumber('@mc:onboardingStep', 0) as 0 | 1 | 2 | 3,
  selectedLines: storage.getStringArray('@mc:savedLines') || [],
  pinnedStations: storage.getObjectArray('@mc:pinnedStations', []) as UserPreferencesState['pinnedStations'],
  notificationsGranted: false,
  trialStartDate: null
};

const runMigrations = (state: UserPreferencesState) => {
  if (state.schemaVersion < 1) {
    // Migrate from schema version 0 to 1
    state.schemaVersion = 1;
    storage.set('@mc:schemaVersion', 1);
  }
};

export const useUserPreferencesStore = create<UserPreferencesState>((set, get) => ({
  ...initialState,
  completeOnboarding: () => {
    set(state => {
      runMigrations(state);
      state.hasCompletedOnboarding = true;
      storage.set('@mc:hasCompletedOnboarding', true);
      return state;
    });
  },
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
      state.selectedLines = lines;
      storage.set('@mc:savedLines', lines);
      return state;
    });
  },
  pinStation: (station: { id: string; name: string; lines: string[] }, role: 'home' | 'work' | 'other') => {
    set(state => {
      const stations = [...state.pinnedStations];
      if (stations.length < 5) {
        stations.push({ ...station, role });
        state.pinnedStations = stations;
        storage.set('@mc:pinnedStations', stations);
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
        state.pinnedStations = stations;
        storage.set('@mc:pinnedStations', stations);
      }
      return state;
    });
  },
  reorderLines: (order: string[]) => {
    set(state => {
      state.selectedLines = order;
      storage.set('@mc:savedLines', order);
      return state;
    });
  },
  reorderStations: (order: { id: string; name: string; lines: string[] }[]) => {
    set(state => {
      state.pinnedStations = order;
      storage.set('@mc:pinnedStations', order);
      return state;
    });
  }
}));
