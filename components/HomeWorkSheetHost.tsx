// components/HomeWorkSheetHost.tsx
// Global host for the Home & Work FixItSheet, mounted next to PillBridge in
// _layout. Opened by the assumption-reveal pill's onPress so the user can
// review/correct the silent pin-order default (first pinned = home, second
// = work) without hunting through Settings.
//
// One-shot semantics: ANY close retires the reveal forever (persisted
// assumptionRevealed flag). Closing with no changes = implicit accept of
// the silent assumption; closing with changes = explicit roles exist, so
// the reveal condition is false anyway. The guarded require keeps this
// host independent of the inference workstream landing.

import React from 'react';
import { FixItSheet } from './FixItSheet';
import { useHomeWorkSheetStore } from '../store/homeWorkSheetStore';
import { markAssumptionRevealed } from '../utils/commuteInference';

export function HomeWorkSheetHost(): React.JSX.Element {
  const open = useHomeWorkSheetStore((s) => s.open);
  const setOpen = useHomeWorkSheetStore((s) => s.setOpen);

  return (
    <FixItSheet
      visible={open}
      onClose={() => {
        setOpen(false);
        markAssumptionRevealed();
      }}
    />
  );
}
