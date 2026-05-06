// store/userPreferencesStore.ts
import create from 'zustand';
import { persist } from 'zustand/middleware';

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
  hasCompletedOnboarding: false,
  onboardingStep: 0,
  selectedLines: [],
  pinnedStations: [],
  notificationsGranted: false,
  trialStartDate: null
};

export const useUserPreferencesStore = create<UserPreferencesState>()(
  persist(
    (set, get) => ({
      ...initialState,
      completeOnboarding: () => {
        set(state => {
          state.hasCompletedOnboarding = true;
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
          return state;
        });
      },
      pinStation: (station: { id: string; name: string; lines: string[] }, role: 'home' | 'work' | 'other') => {
        set(state => {
          const stations = [...state.pinnedStations];
          if (stations.length < 5) {
            stations.push({ ...station, role });
            state.pinnedStations = stations;
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
          }
          return state;
        });
      },
      reorderLines: (order: string[]) => {
        set(state => {
          state.selectedLines = order;
          return state;
        });
      },
      reorderStations: (order: { id: string; name: string; lines: string[] }[]) => {
        set(state => {
          state.pinnedStations = order;
          return state;
        });
      }
    }),
    {
      name: 'user-preferences',
      version: 1,
    }
  )
);
