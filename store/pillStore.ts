// store/pillStore.ts
// Transient UI state for the Dynamic Island-style pill system (gooey shell).
// NOT persisted: pill state lives only for the current app session.
// Priority queue: disruption (3) > boarding (2) > primer (1) > intent (0).
// A higher or equal priority request preempts the active pill; a lower one
// is dropped. Intent is 0 — strictly lowest, so it can NEVER preempt any
// other pill and is dropped whenever anything else is active. It is ambient
// context, not an alert; the queue semantics guarantee that ordering.
import { create } from 'zustand';

export type PillKind = 'disruption' | 'boarding' | 'primer' | 'intent';

export interface PillRequest {
  kind: PillKind;
  id: string; // unique per pill event
  title: string;
  message: string;
  accent: string; // hex color string, e.g. '#E32017'
  onPress?: () => void;
}

export const PRIORITY: Record<PillKind, number> = {
  disruption: 3,
  boarding: 2,
  primer: 1,
  intent: 0,
};

interface PillState {
  active: PillRequest | null;
  requestPill: (req: PillRequest) => void;
  clearPill: () => void;
}

export const usePillStore = create<PillState>()((set, get) => ({
  active: null,
  requestPill: (req) => {
    const { active } = get();
    if (active && req.id === active.id) return; // already showing this event
    if (!active || PRIORITY[req.kind] >= PRIORITY[active.kind]) {
      set({ active: req }); // preemption: equal or higher priority wins
    }
    // lower priority while a pill is active: dropped
  },
  clearPill: () => set({ active: null }),
}));

export const useActivePill = () => usePillStore((s) => s.active);
