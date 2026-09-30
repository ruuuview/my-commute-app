// Session-scoped mutual exclusion for the Dynamic Island-style pill.
// A pill must never compete with a focused setup, modal, or drag gesture.
import { create } from 'zustand';

export type PillSuppressionReason = 'onboarding' | 'modal' | 'card-drag' | 'route';

interface PillSuppressionState {
  reasons: Record<PillSuppressionReason, number>;
  isSuppressed: boolean;
  beginSuppression: (reason: PillSuppressionReason) => void;
  endSuppression: (reason: PillSuppressionReason) => void;
  resetForTests: () => void;
}

const emptyReasons = (): Record<PillSuppressionReason, number> => ({
  onboarding: 0,
  modal: 0,
  'card-drag': 0,
  route: 0,
});

export const usePillSuppressionStore = create<PillSuppressionState>()((set) => ({
  reasons: emptyReasons(),
  isSuppressed: false,
  beginSuppression: (reason) => set((state) => {
    const reasons = { ...state.reasons, [reason]: state.reasons[reason] + 1 };
    return { reasons, isSuppressed: true };
  }),
  endSuppression: (reason) => set((state) => {
    const reasons = { ...state.reasons, [reason]: Math.max(0, state.reasons[reason] - 1) };
    return { reasons, isSuppressed: Object.values(reasons).some((count) => count > 0) };
  }),
  resetForTests: () => set({ reasons: emptyReasons(), isSuppressed: false }),
}));
