import { create } from 'zustand';

/**
 * Global open/close state for the Diagnostics & Sensors drawer.
 * Single instance lives in app/_layout.tsx; every trigger (shake gesture,
 * 3-finger long-press, Settings row, native dev menu item) shares this store.
 */
interface DiagnosticsState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useDiagnosticsStore = create<DiagnosticsState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
