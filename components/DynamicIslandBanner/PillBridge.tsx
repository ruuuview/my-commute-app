// components/DynamicIslandBanner/PillBridge.tsx
// Bridges the transient pill store (store/pillStore.ts) to the vendored
// Dynamic Island (gooey) shell. Must be rendered INSIDE <DynamicNotifications>.
//
// The three edge-trigger hooks (disruption / boarding nudge / permission
// primer) are self-driving: they observe their own data sources and call
// usePillStore.getState().requestPill(...) when they fire. This component
// only mirrors the store's active pill into the gooey shell via trigger().

import React, { useEffect } from 'react';
import { useDynamicNotifications } from './hooks';
import { usePillStore } from '../../store/pillStore';
import { useDisruptionEdgeTrigger } from '../../hooks/useDisruptionEdgeTrigger';
import { useBoardingNudge } from '../../hooks/useBoardingNudge';
import { usePrimerPill } from '../../hooks/usePrimerPill';
import { PillContent } from './PillContent';

export function PillBridge(): React.JSX.Element | null {
  const { trigger, dismiss } = useDynamicNotifications();
  const active = usePillStore((s) => s.active);

  // Self-driving triggers, mounted unconditionally at top level.
  useDisruptionEdgeTrigger();
  useBoardingNudge();
  usePrimerPill();

  useEffect(() => {
    if (!active) {
      dismiss();
    } else {
      dismiss();
      trigger({
        id: active.id,
        title: active.title,
        message: active.message,
        accent: active.accent,
        duration: 4000,
        onPress: active.onPress,
        render: () => (
          <PillContent
            title={active.title}
            message={active.message}
            accent={active.accent}
          />
        ),
      });
    }
  }, [active]);

  return null;
}
