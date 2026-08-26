// store/userPreferencesStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';
import type { StatusLevel } from '../hooks/useWorstStatus';
import { resolveTflStopIdForStore } from '../utils/resolveTflStopId';
import { STORE_VERSION, runMigrations } from './migrations';

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
  onboardingStep: 0 | 1 | 2 | 3; // 0=lines, 1=stations, 2=tfl-registration, 3=done
  selectedLines: string[];
  pinnedStations: { id: string; name: string; lines: string[]; zone: number; role: 'home' | 'work' | 'other' }[];
  notificationsGranted: boolean;
  calendarGranted: boolean;
  locationGranted: boolean;
  tflRegistered: boolean; // TfL account registered (12mo history) vs unregistered (7-day only)
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
  lastPreboardedDirection: string | null; // Priority 1 pre-board (NOT confirmed) — set by directionNotification
  // Radar v2 tri-state account status. Source of truth for Refund Radar UI;
  // legacy `tflRegistered` boolean is kept in lockstep (see setTflAccountStatus).
  tflAccountStatus: 'REGISTERED_28_DAY' | 'UNREGISTERED_7_DAY' | 'NOT_SET';
  // Optimistic local mirror: claimId(string) -> locally-marked-filed epoch ms.
  // Written instantly on "file" tap (offline-safe); pruned once server confirms.
  submittedClaims: Record<string, number>;
  // Claim IDs hidden via optimistic offline dismissal (MMKV-persisted).
  dismissedClaims: string[];
  setHasHydrated: (state: boolean) => void;
  setCalendarGranted: (granted: boolean) => void;
  setNotificationsGranted: (granted: boolean) => void;
  setLocationGranted: (granted: boolean) => void;
  setEntitlementActive: (active: boolean) => void;
  setTflRegistered: (registered: boolean) => void;
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
  setTflAccountStatus: (status: 'REGISTERED_28_DAY' | 'UNREGISTERED_7_DAY' | 'NOT_SET') => void;
  markClaimSubmittedLocally: (claimId: number | string, filedAtMs?: number) => void;
  dismissClaimLocally: (claimId: number | string) => void;
  pruneLocalClaimRecords: (confirmedServerIds: (number | string)[]) => void;
}

const initialState: Omit<UserPreferencesState, 'setHasHydrated' | 'setCalendarGranted' | 'setNotificationsGranted' | 'setLocationGranted' | 'setEntitlementActive' | 'completeOnboarding' | 'toggleLine' | 'pinStation' | 'unpinStation' | 'reorderLines' | 'reorderStations' | 'resetOnboarding' | 'setLastKnown' | 'addRecentSearch' | 'clearRecentSearches' | 'toggleStationFilter' | 'setHapticsEnabled' | 'toggleLineNotification' | 'toggleStationNotification' | 'confirmLabels' | 'dismissConfirmationCard' | 'setStationRole' | 'setArrivalNotificationsEnabled' | 'setArrivalSnoozeExpiry' | 'setTflRegistered' | 'setTflAccountStatus' | 'markClaimSubmittedLocally' | 'dismissClaimLocally' | 'pruneLocalClaimRecords'> = {
  schemaVersion: 0,
  hasCompletedOnboarding: false,
  onboardingStep: 0,
  selectedLines: [],
  pinnedStations: [],
  notificationsGranted: false,
  calendarGranted: false,
  locationGranted: false,
  tflRegistered: false,
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
  lastPreboardedDirection: null,
  tflAccountStatus: 'NOT_SET',
  submittedClaims: {},
  dismissedClaims: [],
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
      setTflRegistered: (registered) => {
        // NOTE — Day 23 copy branching (see master plan REFUND RADAR section):
        // This flag is the branch key for the Day 23 notification copy bank.
        // Registered users (tflRegistered === true) must receive the DEADLINE-URGENCY
        // variant ("your £X turns into £0.00 this week...") because they have up to
        // 12 months of claimable history and the deadline is real for them.
        // Unregistered users (tflRegistered === false) must NEVER receive deadline urgency
        // for a journey they cannot access — they get the "register now so the next one
        // doesn't vanish too" variant instead. The notification copy logic (not built here)
        // reads this flag from the store before selecting the template. Do not show urgency
        // to unregistered users.
        set((state) => ({
          tflRegistered: registered,
          tflAccountStatus: registered
            ? ('REGISTERED_28_DAY' as const)
            : state.tflAccountStatus === 'REGISTERED_28_DAY'
              ? ('UNREGISTERED_7_DAY' as const)
              : state.tflAccountStatus,
        }));
      },
      completeOnboarding: () => set({ hasCompletedOnboarding: true, onboardingStep: 3 }),
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
      setTflAccountStatus: (status) => {
        // Single writer for the Radar v2 tri-state; the legacy boolean stays
        // in lockstep so every existing boolean consumer keeps working.
        set({ tflAccountStatus: status, tflRegistered: status === 'REGISTERED_28_DAY' });
      },
      markClaimSubmittedLocally: (claimId, filedAtMs) => {
        set((state) => ({
          submittedClaims: {
            ...(state.submittedClaims || {}),
            [String(claimId)]: filedAtMs ?? Date.now(),
          },
        }));
      },
      dismissClaimLocally: (claimId) => {
        set((state) => {
          const key = String(claimId);
          if ((state.dismissedClaims || []).includes(key)) return state;
          return { dismissedClaims: [...(state.dismissedClaims || []), key] };
        });
      },
      pruneLocalClaimRecords: (confirmedServerIds) => {
        set((state) => {
          const live = new Set(confirmedServerIds.map(String));
          const submittedEntries = Object.entries(state.submittedClaims || {});
          const dismissedBefore = (state.dismissedClaims || []).length;
          const submitted = Object.fromEntries(
            submittedEntries.filter(([id]) => !live.has(id))
          );
          const dismissed = (state.dismissedClaims || []).filter((id) => !live.has(id));
          if (
            Object.keys(submitted).length === submittedEntries.length &&
            dismissed.length === dismissedBefore
          ) {
            return state;
          }
          return { submittedClaims: submitted, dismissedClaims: dismissed };
        });
      },
    }),
    {
      name: 'user-preferences',
      version: STORE_VERSION,
      migrate: (persistedState, version) => runMigrations(persistedState, version, STORE_VERSION),
      storage: createJSONStorage(() => mmkvStorageAdapter),
      partialize: (state) => {
        const { _hasHydrated, setHasHydrated, setCalendarGranted, setNotificationsGranted, setLocationGranted, setEntitlementActive, toggleStationFilter, setHapticsEnabled, toggleLineNotification, toggleStationNotification, confirmLabels, dismissConfirmationCard, setStationRole, setArrivalNotificationsEnabled, setArrivalSnoozeExpiry, setTflAccountStatus, markClaimSubmittedLocally, dismissClaimLocally, pruneLocalClaimRecords, ...persisted } = state;
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
            // Radar v2 backfill: legacy installs persist only the boolean.
            // Derive the tri-state once so the new UI branches correctly.
            if (state.tflAccountStatus === 'NOT_SET' && state.tflRegistered) {
              setTimeout(() => {
                useUserPreferencesStore.setState({ tflAccountStatus: 'REGISTERED_28_DAY' });
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
