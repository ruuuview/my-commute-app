// store/authFlowStore.ts
// AuthFlowState — persisted origin-tracking for the TfL OAuth return path.
// Locked by the remediation plan Phase 1 (#3, #11): origin must survive
// app suspension, hence MMKV persistence (NOT in-memory).

import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';

const storage = createMMKV({ id: 'auth-flow-storage' });

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

export type AuthOrigin = 'dashboard' | 'refund_radar' | 'onboarding';

export interface AuthFlowState {
  originScreen: AuthOrigin | null;
  authInFlight: boolean;
  lastAuthAttemptAt: number | null;
  beginAuth: (origin: AuthOrigin) => void;
  completeAuth: () => void;
  failAuth: () => void;
}

export const useAuthFlowStore = create<AuthFlowState>()(
  persist(
    (set) => ({
      originScreen: null,
      authInFlight: false,
      lastAuthAttemptAt: null,

      // Call BEFORE launching ASWebAuthenticationSession so the callback
      // handler knows where to router.replace() back to.
      beginAuth: (origin) =>
        set({
          originScreen: origin,
          authInFlight: true,
          lastAuthAttemptAt: Date.now(),
        }),

      completeAuth: () =>
        set({ originScreen: null, authInFlight: false }),

      failAuth: () =>
        set({ originScreen: null, authInFlight: false }),
    }),
    {
      name: 'auth-flow',
      storage: createJSONStorage(() => mmkvStorageAdapter),
    }
  )
);
