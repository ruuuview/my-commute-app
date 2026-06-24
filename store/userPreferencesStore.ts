// store/userPreferencesStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';
import type { StatusLevel } from '../hooks/useWorstStatus';
import { useOnboardingStore } from './onboardingStore';
import * as Haptics from 'expo-haptics';

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

export interface UserPreferencesState {
  schemaVersion: number;
  hasCompletedOnboarding: boolean;
  onboardingStep: 0 | 1 | 2 | 3;
  selectedLines: string[];
  pinnedStations: { id: string; name: string; lines: string[]; zone: number; role: 'home' | 'work' | 'other' }[];
  notificationsGranted: boolean;
  calendarGranted: boolean;
  locationGranted: boolean;
  entitlementActive: boolean;
  trialStartDate: string | null;
  lastKnownStatus: StatusLevel;
  lastKnownData: any[];
  _hasHydrated: boolean;
  sessionCount: number;
  firstOpenTimestamp: number | null;
  setHasHydrated: (state: boolean) => void;
  setCalendarGranted: (granted: boolean) => void;
  setNotificationsGranted: (granted: boolean) => void;
  setLocationGranted: (granted: boolean) => void;
  setEntitlementActive: (active: boolean) => void;
  completeOnboarding: () => void;
  toggleLine: (id: string) => void;
  pinStation: (station: { id: string; name: string; lines: string[]; zone: number }, role: 'home' | 'work' | 'other') => void;
  unpinStation: (id: string) => void;
  reorderLines: (order: string[]) => void;
  reorderStations: (order: { id: string; name: string; lines: string[]; zone: number; role: 'home' | 'work' | 'other' }[]) => void;
  resetOnboarding: () => void;
  recentSearches: string[];
  addRecentSearch: (stationId: string) => void;
  clearRecentSearches: () => void;
  setLastKnown: (status: StatusLevel, data: any[]) => void;
  stationFilterToggles: Record<string, boolean>;
  toggleStationFilter: (stationId: string) => void;
}

const initialState: Omit<UserPreferencesState, 'setHasHydrated' | 'setCalendarGranted' | 'setNotificationsGranted' | 'setLocationGranted' | 'setEntitlementActive' | 'completeOnboarding' | 'toggleLine' | 'pinStation' | 'unpinStation' | 'reorderLines' | 'reorderStations' | 'resetOnboarding' | 'setLastKnown' | 'addRecentSearch' | 'clearRecentSearches' | 'toggleStationFilter'> = {
  schemaVersion: 1,
  hasCompletedOnboarding: false,
  onboardingStep: 0,
  selectedLines: [],
  pinnedStations: [],
  notificationsGranted: false,
  calendarGranted: false,
  locationGranted: false,
  entitlementActive: false,
  trialStartDate: null,
  lastKnownStatus: 'unknown',
  lastKnownData: [],
  _hasHydrated: false,
  sessionCount: 0,
  firstOpenTimestamp: null,
  recentSearches: [],
  stationFilterToggles: {},
};

const validateStationZoneCache = (pinnedStations: any[]) => {
  if (!pinnedStations) return;
  const EXCLUDED_IDS = new Set(['kings-cross-intl', 'st-pancras-international', 'HUBKGX']);
  const cleanedStations = pinnedStations.filter(station => 
    station.zone !== undefined && !EXCLUDED_IDS.has(station.id)
  );
  if (cleanedStations.length !== pinnedStations.length) {
    useUserPreferencesStore.setState({ pinnedStations: cleanedStations });
  }
};

export const useUserPreferencesStore = create<UserPreferencesState>()(
  persist(
    (set) => ({
      ...initialState,
      addRecentSearch: (stationId: string) => {
        set(state => {
          const list = state.recentSearches || [];
          const filtered = list.filter(id => id !== stationId);
          const updated = [stationId, ...filtered].slice(0, 8);
          return { recentSearches: updated };
        });
      },
      clearRecentSearches: () => {
        set({ recentSearches: [] });
      },
      setLastKnown: (status, data) => set({ lastKnownStatus: status, lastKnownData: data }),
      setHasHydrated: (state) => set({ _hasHydrated: state }),
      setCalendarGranted: (granted) => set({ calendarGranted: granted }),
      setNotificationsGranted: (granted) => set({ notificationsGranted: granted }),
      setLocationGranted: (granted) => set({ locationGranted: granted }),
      setEntitlementActive: (active) => set({ entitlementActive: active }),
      completeOnboarding: () => set({ hasCompletedOnboarding: true, onboardingStep: 2 }),
      resetOnboarding: () => set({ hasCompletedOnboarding: false, onboardingStep: 0, selectedLines: [], pinnedStations: [] }),
      toggleLine: (id: string) => {
        set(state => {
          const lines = [...state.selectedLines];
          const includes = lines.includes(id);
          if (!includes && lines.length >= 5) {
            // Cap at 5! Block selection additions.
            return state;
          }
          if (includes) {
            lines.splice(lines.indexOf(id), 1);
          } else {
            lines.push(id);
          }
          return { selectedLines: lines };
        });
      },
      pinStation: (station: { id: string; name: string; lines: string[]; zone: number }, role: 'home' | 'work' | 'other') => {
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
      reorderStations: (order: { id: string; name: string; lines: string[]; zone: number; role: 'home' | 'work' | 'other' }[]) => {
        set({ pinnedStations: order });
      },
      toggleStationFilter: (stationId: string) => {
        set(state => {
          const current = { ...(state.stationFilterToggles || {}) };
          current[stationId] = !current[stationId];
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          return { stationFilterToggles: current };
        });
      }
    }),
    {
      name: 'user-preferences',
      version: 1,
      storage: createJSONStorage(() => mmkvStorageAdapter),
      partialize: (state) => {
        const { _hasHydrated, setHasHydrated, setCalendarGranted, setNotificationsGranted, setLocationGranted, setEntitlementActive, toggleStationFilter, ...persisted } = state;
        return persisted;
      },
      onRehydrateStorage: () => (state) => {
        try {
          if (state) {
            validateStationZoneCache(state.pinnedStations);
            
            // Also clean up onboarding store's pinned stations if they contain excluded IDs
            const onboardingPinned = useOnboardingStore.getState().pinnedStations;
            const EXCLUDED_IDS = new Set(['kings-cross-intl', 'st-pancras-international', 'HUBKGX']);
            const cleanedOnboarding = onboardingPinned ? onboardingPinned.filter(s => s && s.id && !EXCLUDED_IDS.has(s.id)) : [];
            if (onboardingPinned && cleanedOnboarding.length !== onboardingPinned.length) {
              useOnboardingStore.setState({ pinnedStations: cleanedOnboarding });
            }
          }
        } catch (e) {
          console.error("Hydration validation failed:", e);
        } finally {
          if (state) {
            state.setHasHydrated(true);
          }
        }
      },
    }
  )
);
