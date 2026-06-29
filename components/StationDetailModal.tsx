/**
 * StationDetailModal.tsx
 * ─────────────────────────────────────────────────────────────────
 * Frosted-glass popup anchored to a tapped DepartureCard.
 * Positions BELOW the card if space allows, flips ABOVE if not.
 * Uses measureInWindow coordinates — no entrance animation.
 * ─────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveTflStopIds } from '../utils/resolveTflStopId';
import { normaliseLineId } from '../utils/normaliseLineId';
import { LINE_COLORS } from '../constants/lineColors';
import { IMMINENT_BLUE } from '../theme/colors';

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface Departure {
  destination: string;
  line: string;
  platform: string;
  minutes_away: number;
  expected_arrival: string;
}

export interface StationDetailModalProps {
  stationId: string;
  stationName: string;
  /** pageY from measureInWindow on the tapped card wrapper */
  anchorPageY: number;
  /** measured height of the tapped card */
  anchorCardHeight: number;
  onDismiss: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────
function getLineColor(lineName: string): string {
  const { cleanLineId } = normaliseLineId(lineName);
  return LINE_COLORS[cleanLineId] || '#888888';
}

function formatTime(minutes: number): string {
  if (minutes <= 0) return 'Due';
  return `${minutes} min`;
}

function cleanDestination(dest: string): string {
  return String(dest || '')
    .replace(' Underground Station', '')
    .replace(' DLR Station', '')
    .replace(' Rail Station', '')
    .trim();
}

// ─── Component ───────────────────────────────────────────────────
export default function StationDetailModal({
  stationId,
  stationName,
  anchorPageY,
  anchorCardHeight,
  onDismiss,
}: StationDetailModalProps) {
  const { bottom: safeAreaBottom, top: safeAreaTop } = useSafeAreaInsets();
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [loading, setLoading] = useState(true);
  // Dynamic height measured from onLayout — used for flip math
  const [popupHeight, setPopupHeight] = useState(0);

  const cleanName = String(stationName ?? '')
    .replace(/\s*(?:Underground Station|Elizabeth line Station|Overground Station|DLR Station|Rail Station|Station)$/i, '')
    .trim();

  // ── Fetch departures ──────────────────────────────────────────
  const fetchDepartures = useCallback(async () => {
    try {
      setLoading(true);
      const resolvedIds = resolveTflStopIds(stationId);
      const responses = await Promise.all(
        resolvedIds.map(id =>
          fetch(`https://my-commute-backend.vercel.app/api/stations/${id}`)
            .then(res => (res.ok ? res.json() : null))
            .catch(() => null)
        )
      );

      const allRaw: any[] = [];
      responses.forEach(data => {
        if (data?.departures) allRaw.push(...data.departures);
      });

      const seen = new Set<string>();
      const deduped = allRaw.filter(dep => {
        const dest = String(dep.destination || '');
        if (dest.includes('DELETE') || dest.includes('⚠️')) return false;
        const key = `${dep.line}-${dep.platform || dep.destination}-${dep.expected_arrival}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      deduped.sort((a, b) => (a.minutes_away || 0) - (b.minutes_away || 0));
      setDepartures(deduped);
    } catch (e) {
      console.log('[StationDetailModal] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [stationId]);

  useEffect(() => {
    fetchDepartures();
  }, [fetchDepartures]);

  // ── Group by direction ────────────────────────────────────────
  const { northbound, southbound, other } = useMemo(() => {
    const nb: Departure[] = [];
    const sb: Departure[] = [];
    const ot: Departure[] = [];
    departures.forEach(dep => {
      const p = String(dep.platform || '').toLowerCase();
      if (p.includes('northbound') || p.includes('eastbound')) nb.push(dep);
      else if (p.includes('southbound') || p.includes('westbound')) sb.push(dep);
      else ot.push(dep);
    });
    return { northbound: nb, southbound: sb, other: ot };
  }, [departures]);

  // ── Flip-position math ────────────────────────────────────────
  const measured = popupHeight > 0;

  const popupTop = useMemo(() => {
    if (!measured) {
      // Off-screen while measuring; snaps into place on first layout
      return anchorPageY + anchorCardHeight + 8;
    }
    const spaceBelow =
      SCREEN_HEIGHT - safeAreaBottom - (anchorPageY + anchorCardHeight);

    if (spaceBelow >= popupHeight + 8) {
      // Enough room below — position below card
      return anchorPageY + anchorCardHeight + 8;
    }
    // Flip above card, clamp to safe area top
    const above = anchorPageY - popupHeight - 8;
    return Math.max(above, safeAreaTop + 8);
  }, [measured, popupHeight, anchorPageY, anchorCardHeight, safeAreaBottom, safeAreaTop]);

  // ── Render a single departure row ─────────────────────────────
  const renderDeparture = (dep: Departure, idx: number) => {
    const lineColor = getLineColor(dep.line);
    const isImminent = dep.minutes_away <= 2;
    return (
      <View key={`dep-${idx}`} style={s.depRow} testID={`modal-dep-row-${idx}`}>
        <View style={[s.depDot, { backgroundColor: lineColor }]} />
        <Text style={s.depLine} numberOfLines={1}>
          {dep.line}
        </Text>
        <Text style={s.depDest} numberOfLines={1}>
          {cleanDestination(dep.destination)}
        </Text>
        <Text
          style={[s.depTime, isImminent && s.depTimeImminent]}
          numberOfLines={1}
        >
          {formatTime(dep.minutes_away)}
        </Text>
      </View>
    );
  };

  // ── Render a direction section ────────────────────────────────
  const renderSection = (
    label: string,
    deps: Departure[],
    testIdKey: string
  ) => {
    if (deps.length === 0) return null;
    return (
      <View style={s.section} testID={`modal-section-${testIdKey}`}>
        <Text style={s.dirLabel}>{label}</Text>
        {deps.slice(0, 3).map(renderDeparture)}
      </View>
    );
  };

  const dirLabel = (deps: Departure[], defaultLabel: string): string => {
    if (deps.length === 0) return defaultLabel;
    const p = String(deps[0].platform || '').toLowerCase();
    if (p.includes('eastbound')) return '→ EASTBOUND';
    if (p.includes('westbound')) return '← WESTBOUND';
    return defaultLabel;
  };

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={onDismiss}
      testID="station-detail-modal"
    >
      {/* Full-screen hit area: scrim absorbs background touches */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
        <Pressable
          style={[StyleSheet.absoluteFillObject, s.scrim]}
          onPress={onDismiss}
          testID="station-modal-scrim"
        />

        {/* ── Popup panel — absolutely positioned, NO entrance animation ── */}
        <View
          style={[
            s.panel,
            {
              top: popupTop,
              opacity: measured ? 1 : 0,
            },
          ]}
          onLayout={e => setPopupHeight(e.nativeEvent.layout.height)}
          testID="station-detail-popup"
        >
          {/* Frosted glass background */}
          <BlurView
            intensity={55}
            tint="dark"
            style={StyleSheet.absoluteFillObject}
          />
          {/* Additional tint overlay */}
          <View style={s.panelTint} pointerEvents="none" />

          {/* Content */}
          <View style={s.content}>
            {/* Header row */}
            <View style={s.header}>
              <Text style={s.stationName} numberOfLines={1} testID="modal-station-name">
                {cleanName}
              </Text>
              <Pressable
                onPress={onDismiss}
                hitSlop={12}
                style={s.closeHitArea}
                testID="station-modal-close"
              >
                <Text style={s.closeBtn}>✕</Text>
              </Pressable>
            </View>

            {/* Body */}
            {loading ? (
              <View style={s.loadingRow}>
                <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
                <Text style={s.loadingText}>Fetching departures…</Text>
              </View>
            ) : departures.length === 0 ? (
              <Text style={s.emptyText} testID="modal-empty">
                No trains right now
              </Text>
            ) : (
              <>
                {renderSection(
                  dirLabel(northbound, '↑ NORTHBOUND'),
                  northbound,
                  'northbound'
                )}
                {renderSection(
                  dirLabel(southbound, '↓ SOUTHBOUND'),
                  southbound,
                  'southbound'
                )}
                {/* Fallback: ungrouped departures (no direction info) */}
                {northbound.length === 0 &&
                  southbound.length === 0 &&
                  renderSection('DEPARTURES', other, 'all')}
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────
const s = StyleSheet.create({
  scrim: {
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  panelTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  stationName: {
    flex: 1,
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  closeHitArea: {
    padding: 4,
  },
  closeBtn: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },
  section: {
    marginBottom: 12,
  },
  dirLabel: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 10,
    color: 'rgba(255,255,255,0.40)',
    letterSpacing: 0.9,
    marginBottom: 7,
  },
  depRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    gap: 8,
  },
  depDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  depLine: {
    width: 76,
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.65)',
  },
  depDest: {
    flex: 1,
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.90)',
  },
  depTime: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  depTimeImminent: {
    color: IMMINENT_BLUE,
    fontWeight: '700',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  loadingText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
  },
  emptyText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    paddingVertical: 14,
  },
});
