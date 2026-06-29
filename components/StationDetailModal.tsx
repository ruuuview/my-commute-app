/**
 * StationDetailModal.tsx
 * ─────────────────────────────────────────────────────────────────
 * Frosted-glass popup anchored to a tapped DepartureCard.
 * Positions BELOW the card if space allows, flips ABOVE if not.
 * Groups departures by line, shows ⊞ toggle for Your Lines / All.
 * ─────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
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

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SCREEN_WIDTH = Dimensions.get('window').width;

const DUE_GREEN = '#30D158';

interface Departure {
  destination: string;
  line: string;
  platform: string;
  minutes_away: number;
  expected_arrival: string;
}

interface LineGroup {
  lineId: string;
  lineName: string;
  lineColor: string;
  departures: Departure[];
}

export interface StationDetailModalProps {
  stationId: string;
  stationName: string;
  anchorPageY: number;
  anchorCardHeight: number;
  onDismiss: () => void;
  /** User's pinned line IDs for ⊞ toggle filtering */
  selectedLines?: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────
function getLineColor(lineName: string): string {
  const { cleanLineId } = normaliseLineId(lineName);
  return LINE_COLORS[cleanLineId] || '#888888';
}

function cleanDestination(dest: string): string {
  return String(dest || '')
    .replace(' Underground Station', '')
    .replace(' DLR Station', '')
    .replace(' Rail Station', '')
    .replace(/\b(Northbound|Southbound|Eastbound|Westbound)\b\s*[-–—]?\s*/gi, '')
    .trim();
}

/** Extract platform number only — strip compass directions */
function cleanPlatform(platform: string): string {
  if (!platform) return '';
  // "Eastbound - P6" → "P6", "Northbound - Platform 1" → "Platform 1"
  const stripped = String(platform)
    .replace(/\b(Northbound|Southbound|Eastbound|Westbound)\b\s*[-–—]?\s*/gi, '')
    .trim();
  return stripped;
}

// ─── Component ───────────────────────────────────────────────────
export default function StationDetailModal({
  stationId,
  stationName,
  anchorPageY,
  anchorCardHeight,
  onDismiss,
  selectedLines = [],
}: StationDetailModalProps) {
  const { top: safeAreaTop } = useSafeAreaInsets();
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [loading, setLoading] = useState(true);
  const [popupHeight, setPopupHeight] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

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
      setFetchedAt(new Date());
    } catch (e) {
      console.log('[StationDetailModal] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [stationId]);

  useEffect(() => {
    fetchDepartures();
  }, [fetchDepartures]);

  // ── Group departures by line ──────────────────────────────────
  const lineGroups: LineGroup[] = useMemo(() => {
    const map = new Map<string, LineGroup>();
    departures.forEach(dep => {
      const { lineId, cleanLineId } = normaliseLineId(dep.line);
      if (!map.has(lineId)) {
        map.set(lineId, {
          lineId,
          lineName: dep.line,
          lineColor: LINE_COLORS[cleanLineId] || '#888',
          departures: [],
        });
      }
      map.get(lineId)!.departures.push(dep);
    });
    return Array.from(map.values());
  }, [departures]);

  // ── Filter by ⊞ toggle: Your Lines vs All Departures ─────────
  const filteredGroups = useMemo(() => {
    if (showAll) {
      // Pinned first, then unpinned with separator handled in render
      const pinned = lineGroups.filter(g => selectedLines.includes(g.lineId));
      const unpinned = lineGroups.filter(g => !selectedLines.includes(g.lineId));
      return { pinned, unpinned };
    }
    // Your Lines only
    const pinned = selectedLines.length > 0
      ? lineGroups.filter(g => selectedLines.includes(g.lineId))
      : lineGroups;
    return { pinned, unpinned: [] as LineGroup[] };
  }, [lineGroups, selectedLines, showAll]);

  // ── Freshness badge ───────────────────────────────────────────
  const freshnessText = useMemo(() => {
    if (!fetchedAt) return '';
    const secs = Math.round((Date.now() - fetchedAt.getTime()) / 1000);
    if (secs < 10) return 'Just now';
    if (secs < 60) return `${secs}s ago`;
    return `${Math.floor(secs / 60)}m ago`;
  }, [fetchedAt]);

  // ── Flip-position math ────────────────────────────────────────
  const measured = popupHeight > 0;
  const popupTop = useMemo(() => {
    if (!measured) return anchorPageY + anchorCardHeight + 8;
    const spaceBelow = SCREEN_HEIGHT - (anchorPageY + anchorCardHeight);
    if (spaceBelow >= SCREEN_HEIGHT * 0.6) {
      return anchorPageY + anchorCardHeight + 8;
    }
    const above = anchorPageY - popupHeight - 8;
    const floor = safeAreaTop + 12;
    return Math.max(above, floor);
  }, [measured, popupHeight, anchorPageY, anchorCardHeight, safeAreaTop]);

  // ── Render a single arrival row ───────────────────────────────
  const renderArrival = (dep: Departure, idx: number, isFirstDueForLine: boolean) => {
    const isDue = dep.minutes_away <= 0;
    const platform = cleanPlatform(dep.platform);
    const dest = cleanDestination(dep.destination);

    let timeText: string;
    let timeStyle: any[];

    if (isDue) {
      timeText = 'Due';
      if (isFirstDueForLine) {
        timeStyle = [s.depTime, { color: DUE_GREEN, fontWeight: '700' as const }];
      } else {
        timeStyle = [s.depTime, { color: '#FFFFFF' }];
      }
    } else {
      timeText = `${dep.minutes_away} min`;
      timeStyle = [s.depTime];
    }

    return (
      <View key={`arr-${idx}`} style={s.arrivalRow} testID={`modal-arrival-${idx}`}>
        <Text style={s.arrivalDest} numberOfLines={1}>{dest}</Text>
        {platform ? <Text style={s.arrivalPlatform} numberOfLines={1}>{platform}</Text> : null}
        <Text style={timeStyle} numberOfLines={1}>{timeText}</Text>
      </View>
    );
  };

  // ── Render a line section ─────────────────────────────────────
  const renderLineSection = (group: LineGroup, idx: number) => {
    const sliced = group.departures.slice(0, 3);
    let firstDueSeen = false;

    // Determine first and last terminals from all departures for this line
    const destinations = group.departures.map(d => cleanDestination(d.destination));
    const firstTerminal = destinations[0] || '';
    const lastTerminal = destinations.length > 1 ? destinations[destinations.length - 1] : '';

    return (
      <View key={group.lineId} style={idx > 0 ? { marginTop: 16 } : undefined} testID={`modal-line-${group.lineId}`}>
        {/* Line header: color bar + name in small caps */}
        <View style={s.lineHeader}>
          <View style={[s.lineColorBar, { backgroundColor: group.lineColor }]} />
          <Text style={s.lineHeaderName}>{group.lineName.toUpperCase()}</Text>
        </View>

        {/* Arrival rows — max 3 */}
        {sliced.map((dep, arrIdx) => {
          const isDue = dep.minutes_away <= 0;
          const isFirstDue = isDue && !firstDueSeen;
          if (isDue) firstDueSeen = true;
          return renderArrival(dep, arrIdx, isFirstDue);
        })}

        {/* Hairline separator */}
        <View style={s.hairline} />

        {/* First / Last footer — terminal names, not compass */}
        {(firstTerminal || lastTerminal) && (
          <View style={s.footerRow}>
            {firstTerminal ? <Text style={s.footerText}>First → {firstTerminal}</Text> : null}
            {lastTerminal && lastTerminal !== firstTerminal ? (
              <Text style={s.footerText}>Last → {lastTerminal}</Text>
            ) : null}
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={onDismiss}
      testID="station-detail-modal"
    >
      <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
        {/* Scrim */}
        <Pressable
          style={[StyleSheet.absoluteFillObject, s.scrim]}
          onPress={onDismiss}
          testID="station-modal-scrim"
        />

        {/* Popup panel */}
        <View
          style={[
            s.panel,
            {
              top: popupTop,
              left: 16,
              width: SCREEN_WIDTH - 32,
              opacity: measured ? 1 : 0,
            },
          ]}
          onLayout={e => setPopupHeight(e.nativeEvent.layout.height)}
          testID="station-detail-popup"
        >
          {/* Frosted glass */}
          {Platform.OS === 'ios' ? (
            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFillObject} />
          ) : (
            <View style={[StyleSheet.absoluteFillObject, s.androidBg]} />
          )}

          <View style={s.content}>
            {/* Header row */}
            <View style={s.header}>
              <Text style={s.stationName} numberOfLines={1} testID="modal-station-name">
                {cleanName}
              </Text>
              <View style={s.headerRight}>
                {/* Freshness badge */}
                {freshnessText ? (
                  <Text style={s.freshnessBadge} testID="freshness-badge">{freshnessText}</Text>
                ) : null}
                {/* ⊞ toggle */}
                <Pressable
                  onPress={() => setShowAll(v => !v)}
                  hitSlop={8}
                  style={[s.toggleBtn, showAll && s.toggleBtnActive]}
                  testID="station-toggle-filter"
                >
                  <Text style={s.toggleIcon}>⊞</Text>
                </Pressable>
                {/* Close */}
                <Pressable
                  onPress={onDismiss}
                  hitSlop={12}
                  style={s.closeHitArea}
                  testID="station-modal-close"
                >
                  <Text style={s.closeBtn}>✕</Text>
                </Pressable>
              </View>
            </View>

            {/* Toggle label */}
            <Text style={s.filterLabel}>
              {showAll ? 'All Departures' : 'Your Lines'}
            </Text>

            {/* Scrollable body */}
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
              <ScrollView
                style={{ maxHeight: SCREEN_HEIGHT * 0.55 }}
                showsVerticalScrollIndicator={false}
                testID="modal-scroll-body"
              >
                {filteredGroups.pinned.map((group, idx) => renderLineSection(group, idx))}

                {showAll && filteredGroups.unpinned.length > 0 && (
                  <>
                    <View style={s.separatorRow}>
                      <View style={s.separatorLine} />
                      <Text style={s.separatorText}>Other lines</Text>
                      <View style={s.separatorLine} />
                    </View>
                    {filteredGroups.unpinned.map((group, idx) =>
                      renderLineSection(group, filteredGroups.pinned.length + idx)
                    )}
                  </>
                )}
              </ScrollView>
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
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 24,
  },
  androidBg: {
    backgroundColor: 'rgba(10,10,15,0.95)',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  stationName: {
    flex: 1,
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  freshnessBadge: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
  },
  toggleBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.20)',
  },
  toggleIcon: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
  },
  closeHitArea: {
    padding: 4,
  },
  closeBtn: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },
  filterLabel: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  lineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  lineColorBar: {
    width: 3,
    height: 14,
    borderRadius: 2,
  },
  lineHeaderName: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 10,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  arrivalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  arrivalDest: {
    flex: 1,
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.90)',
  },
  arrivalPlatform: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.40)',
    marginRight: 4,
  },
  depTime: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
    minWidth: 48,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.10)',
    marginTop: 6,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  footerText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 10,
    color: 'rgba(255,255,255,0.30)',
  },
  separatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 4,
    gap: 8,
  },
  separatorLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  separatorText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 10,
    color: 'rgba(255,255,255,0.30)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
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
