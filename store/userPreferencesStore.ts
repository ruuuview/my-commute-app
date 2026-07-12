// store/userPreferencesStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';
import type { StatusLevel } from '../hooks/useWorstStatus';
import { resolveTflStopIdForStore } from '../utils/resolveTflStopId';

const storage = createMMKV();
const backgroundStorage = createMMKV({ id: 'background-storage' });

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
  completedJourneys: number;
  firstOpenTimestamp: number | null;
  labelsConfirmed: boolean;
  hasSeenConfirmationCard: boolean;
  arrivalNotificationsEnabled: boolean;
  arrivalSnoozeExpiry: number | null; // UTC epoch
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
  hapticsEnabled: boolean;
  lineNotificationToggles: Record<string, boolean>;
  stationNotificationToggles: Record<string, boolean>;
  setHapticsEnabled: (enabled: boolean) => void;
  toggleLineNotification: (lineId: string) => void;
  toggleStationNotification: (stationId: string) => void;
  confirmLabels: () => void;
  dismissConfirmationCard: () => void;
  setStationRole: (stationId: string, role: 'home' | 'work' | 'other') => void;
  setArrivalNotificationsEnabled: (enabled: boolean) => void;
  setArrivalSnoozeExpiry: (expiry: number | null) => void;
}

const initialState: Omit<UserPreferencesState, 'setHasHydrated' | 'setCalendarGranted' | 'setNotificationsGranted' | 'setLocationGranted' | 'setEntitlementActive' | 'completeOnboarding' | 'toggleLine' | 'pinStation' | 'unpinStation' | 'reorderLines' | 'reorderStations' | 'resetOnboarding' | 'setLastKnown' | 'addRecentSearch' | 'clearRecentSearches' | 'toggleStationFilter' | 'setHapticsEnabled' | 'toggleLineNotification' | 'toggleStationNotification' | 'confirmLabels' | 'dismissConfirmationCard' | 'setStationRole' | 'setArrivalNotificationsEnabled' | 'setArrivalSnoozeExpiry'> = {
  schemaVersion: 0,
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
  completedJourneys: 0,
  firstOpenTimestamp: null,
  labelsConfirmed: false,
  hasSeenConfirmationCard: false,
  arrivalNotificationsEnabled: true,
  arrivalSnoozeExpiry: null,
  recentSearches: [],
  stationFilterToggles: {},
  hapticsEnabled: true,
  lineNotificationToggles: {},
  stationNotificationToggles: {},
};

const validateStationZoneCache = (state: UserPreferencesState): boolean => {
  const pinnedStations = state.pinnedStations;
  if (!Array.isArray(pinnedStations)) {
    state.pinnedStations = [];
    return false;
  }

  // IDs that should never appear in pinned stations.
  // HUBKGX was removed because the correct King's Cross Hub ID path goes through
  // SLUG_TO_HUB → 940GZZLUKSX (the station's NaPTAN stop point), not via HUBKGX.
  // Keeping HUBKGX here would silently unpin any station that somehow has that ID.
  const EXCLUDED_IDS = new Set(['kings-cross-intl', 'st-pancras-international']);
  const cleanedStations = pinnedStations.filter((station): station is UserPreferencesState['pinnedStations'][number] =>
    !!station &&
    typeof station.id === 'string' &&
    typeof station.name === 'string' &&
    Array.isArray(station.lines) &&
    typeof station.zone === 'number' &&
    !EXCLUDED_IDS.has(station.id)
  );

  const changed = cleanedStations.length !== pinnedStations.length;
  state.pinnedStations = cleanedStations;
  return changed;
};

export const useUserPreferencesStore = create<UserPreferencesState>()(
  persist(
    (set) => ({
      ...initialState,
      addRecentSearch: (stationId: string) => {
        set(state => {
          const resolvedId = resolveTflStopIdForStore(stationId);
          const list = state.recentSearches || [];
          if (list.includes(resolvedId)) return state;
          const current = [resolvedId, ...list].slice(0, 10);
          return { recentSearches: current };
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
            const resolvedId = resolveTflStopIdForStore(station.id);
            console.log('[pinStore] id:', station.id, '→ resolved:', resolvedId, '| name:', station.name);
            if (stations.find(s => s.id === resolvedId)) return state;
            stations.push({ ...station, id: resolvedId, role });
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
          return { stationFilterToggles: current };
        });
      },
      setHapticsEnabled: (enabled) => set({ hapticsEnabled: enabled }),
      toggleLineNotification: (lineId: string) => {
        set(state => {
          const current = { ...(state.lineNotificationToggles || {}) };
          const isEnabled = current[lineId] !== false;
          current[lineId] = !isEnabled;
          
          backgroundStorage.set('notification-toggles', JSON.stringify({
            lines: current,
            stations: state.stationNotificationToggles || {}
          }));

          return { lineNotificationToggles: current };
        });
      },
      toggleStationNotification: (stationId: string) => {
        set(state => {
          const current = { ...(state.stationNotificationToggles || {}) };
          const isEnabled = current[stationId] !== false;
          current[stationId] = !isEnabled;

          backgroundStorage.set('notification-toggles', JSON.stringify({
            lines: state.lineNotificationToggles || {},
            stations: current
          }));

          return { stationNotificationToggles: current };
        });
      },
      confirmLabels: () => set({ labelsConfirmed: true, hasSeenConfirmationCard: true }),
      dismissConfirmationCard: () => set({ hasSeenConfirmationCard: true }),
      setStationRole: (stationId, role) => {
        set(state => {
          // If setting to 'home' or 'work', clear existing station with that role
          let updated = [...state.pinnedStations];
          if (role === 'home' || role === 'work') {
            updated = updated.map(s => s.id === stationId ? { ...s, role } : { ...s, role: s.role === role ? 'other' as const : s.role });
          } else {
            updated = updated.map(s => s.id === stationId ? { ...s, role } : s);
          }
          return { pinnedStations: updated };
        });
      },
      setArrivalNotificationsEnabled: (enabled) => set({ arrivalNotificationsEnabled: enabled }),
      setArrivalSnoozeExpiry: (expiry) => set({ arrivalSnoozeExpiry: expiry }),
    }),
    {
      name: 'user-preferences',
      version: 2,
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as any;
        if (version < 2 && state?.pinnedStations?.length) {
          // Version 1 → 2: Re-resolve pinned station IDs to NaPTANs.
          // Before v2, resolveTflStopIdForStore passed HUB codes through.
          // Now it expands them to NaPTANs. Existing users with stored
          // HUB codes need their IDs re-resolved so the backend can query them.
          state.pinnedStations = state.pinnedStations.map((s: any) => ({
            ...s,
            id: resolveTflStopIdForStore(s.id),
          }));
        }
        return state;
      },
      storage: createJSONStorage(() => mmkvStorageAdapter),
      partialize: (state) => {
        const { _hasHydrated, setHasHydrated, setCalendarGranted, setNotificationsGranted, setLocationGranted, setEntitlementActive, toggleStationFilter, setHapticsEnabled, toggleLineNotification, toggleStationNotification, confirmLabels, dismissConfirmationCard, setStationRole, setArrivalNotificationsEnabled, setArrivalSnoozeExpiry, ...persisted } = state;
        return persisted;
      },
      onRehydrateStorage: () => (state) => {
        try {
          if (state) {
            const hasChanged = validateStationZoneCache(state);
            if (hasChanged) {
              setTimeout(() => {
                useUserPreferencesStore.setState({ pinnedStations: state.pinnedStations });
              }, 0);
            }
          }
        } catch (e) {
          console.error("Hydration validation failed:", e);
        } finally {
          if (state) {
            state.setHasHydrated(true);
          } else {
            setTimeout(() => {
              useUserPreferencesStore.setState({ _hasHydrated: true });
            }, 0);
          }
        }
      },
    }
  )
);
