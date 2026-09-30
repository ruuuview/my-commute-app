import { useEffect } from 'react';
import {
  type PillSuppressionReason,
  usePillSuppressionStore,
} from '../store/pillSuppressionStore';

/** Keeps the ambient pill silent while a focused interaction owns the UI. */
export function usePillSuppression(reason: PillSuppressionReason, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const store = usePillSuppressionStore.getState();
    store.beginSuppression(reason);
    return () => usePillSuppressionStore.getState().endSuppression(reason);
  }, [active, reason]);
}
