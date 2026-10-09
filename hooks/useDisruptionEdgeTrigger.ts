// frontend/hooks/useDisruptionEdgeTrigger.ts
// Edge-triggered disruption pill: fires the pill store ONLY on DOWNWARD
// severity transitions (Good/Minor -> Severe/Suspended) in the live TfL
// line-status feed. Upward recoveries update state silently — no pill.
//
// UNIFICATION: this hook is a VIEW over the island's system, not a parallel
// brain.
// - Severity ranking is the app's single source of truth,
//   getSeverityRank() from utils/getSeverityColor.ts (the same mapping the
//   island payload builder and worst-status aggregation use). The old local
//   severityRank() copy — which had silently diverged from the canonical
//   mapping — is deleted.
// - Suppression is derived from SessionManager (the island's session brain):
//   while a commute session is active the Live Activity already carries the
//   line's disruption status, so the pill defers instead of double-announcing.
//   The legacy dynamicBannerStore flags this used to read were never wired
//   (setHasActiveSession/setVisibleLineIds had zero call sites) — that dead
//   store is deleted.
// - Pill-scoped and intentionally kept here: the downward-edge detection
//   itself (the island has no "edge" concept outside sessions — it renders
//   status continuously), the 10-minute anti-flap bucket, and the
//   show-reroute tap intent.

import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { createMMKV } from 'react-native-mmkv';
import { useLineDataStore } from '../store/lineDataStore';
import { usePillStore } from '../store/pillStore';
import { SessionManager } from '../services/SessionManager';
import { navigateToIntent } from '../services/notifications/intent';
import { isLineId } from '../services/notifications/payload';
import { dismissDisruptionNotification } from '../services/notifications/dispatch';
import { LiveActivityService } from '../services/LiveActivityService';
import { LINE_NAMES } from '../constants/lineColors';
import { STATUS_SEVERITY_COLORS, getSeverityRank } from '../utils/getSeverityColor';

const notifStorage = createMMKV({ id: 'background-storage' });

// Pill ids are bucketed so a flapping feed cannot re-fire the same event.
const BANNER_ID_BUCKET_MS = 10 * 60 * 1000;

export function useDisruptionEdgeTrigger(): void {
  const lines = useLineDataStore((s) => s.lines);
  const router = useRouter();
  const prevRankRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!lines || Object.keys(lines).length === 0) return;

    for (const lineId of Object.keys(lines)) {
      const line = lines[lineId];
      if (!line) continue;

      // Canonical rank: 0 good · 1 minor · 2 severe · 3 suspended.
      const curr = getSeverityRank(line.status_severity);
      const prev = prevRankRef.current[lineId];
      // Always record the latest rank — recoveries resolve silently.
      prevRankRef.current[lineId] = curr;
      // First sighting seeds the baseline WITHOUT firing: a line already
      // severe at cold start is not an edge, and defaulting unseen lines to
      // good would fire a bogus edge pill.
      if (prev === undefined) continue;

      // Upward edge trigger: recovery from severe/suspended back to good/minor
      if (prev >= 2 && curr < 2 && isLineId(lineId)) {
        void dismissDisruptionNotification({ lineId, lineName: LINE_NAMES[lineId] ?? lineId });
        if (SessionManager.getSessionState() !== 'idle') {
          const originStation = SessionManager.getCommuteOriginId() || '';
          if (originStation) {
            void LiveActivityService.update(originStation, lineId);
          }
        }
      }

      // Edge trigger: downward transition into severe/suspended (Expanded Tier).
      if (prev < 2 && curr >= 2 && isLineId(lineId)) {
        // Suppressed while the island's session is live: the Live Activity
        // already carries this disruption — the pill does not double-announce.
        if (SessionManager.getSessionState() !== 'idle') continue;

        // Cross-system dedup: suppress if local OS notification already alerted this line recently
        try {
          const lastNotif = notifStorage.getNumber(`notified_disruption_${lineId}`);
          if (lastNotif && Date.now() - lastNotif < BANNER_ID_BUCKET_MS) {
            continue;
          }
        } catch {
          // Fallback if MMKV unavailable
        }

        const bucket = Math.floor(Date.now() / BANNER_ID_BUCKET_MS);
        usePillStore.getState().requestPill({
          kind: 'disruption',
          tier: 'expanded',
          id: `${lineId}:${curr}:${bucket}`,
          shortLine: LINE_NAMES[lineId] ?? lineId,
          title: `${LINE_NAMES[lineId] ?? lineId} — ${curr >= 3 ? 'Service suspended' : 'Severe delays'}`,
          message: (line.reason ?? line.status ?? '').slice(0, 90),
          actionLabel: 'Reroute',
          accent: STATUS_SEVERITY_COLORS.severe,
          durationMs: null,
          onAction: () =>
            navigateToIntent(router, {
              action: 'show-reroute',
              lineId,
              initialSection: 'alternatives',
              statusAsOf: Date.now(),
            }),
          onPress: () =>
            navigateToIntent(router, {
              action: 'show-reroute',
              lineId,
              initialSection: 'alternatives',
              statusAsOf: Date.now(),
            }),
        });
      }
      // ZERO-NAG & ABSOLUTE SILENCE INVARIANT:
      // Upward recovery transition back to good/minor (curr < 2) is 100% silent.
      // NEVER request a recovery morph pill, NEVER display a popup banner.
    }
  }, [lines, router]);
}
