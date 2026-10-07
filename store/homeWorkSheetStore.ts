// store/homeWorkSheetStore.ts
// Transient UI flag for the global Home & Work sheet host.
//
// The assumption-reveal pill (useSetupConfirmPill) used to open this sheet
// from the pill's onPress; it was unmounted in the 2026-10-07 primers-only
// scope, so the sheet now opens from settings. The host lives next to
// PillBridge in _layout. Deliberately NOT persisted: a stuck "open" across
// restarts would auto-open the sheet.
// FixItSheet with no props uses the settings binding (userPreferencesStore
// pinnedStations + setStationRole), so the host needs no other wiring.

import { create } from 'zustand';

interface HomeWorkSheetState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useHomeWorkSheetStore = create<HomeWorkSheetState>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
