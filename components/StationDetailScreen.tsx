/**
 * StationDetailScreen.tsx
 * ─────────────────────────────────────────────────────────────────
 * Full-screen pushed view for station details.
 * Replaces the anchored popup approach — no flip/position math,
 * no scrim, no BlurView wrapper. Content sits on the DashboardGradient
 * background with per-line glass cards matching DepartureCard/LineCard.
 * ─────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Train } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { DashboardGradient } from './DashboardGradient';

import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { useLineDataStore, LineStatus } from '../store/lineDataStore';
import { GLASS, DUE_TIME_STYLE } from '../theme/colors';
import { fetchNormalizedStationArrivals, NormalizedDeparture } from '../services/apiService';
import { getVisibleArrivals } from '../selectors/stationLines';
import { getSeverityColor } from '../utils/getSeverityColor';

type Departure = NormalizedDeparture;

interface LineGroup {
  lineId: string;
  lineName: string;
  lineColor: string;
  departures: Departure[];
}

export interface StationDetailScreenProps {
  stationId: string;
  stationName: string;
  /** User's pinned line IDs for ⊞ toggle filtering */
  selectedLines?: string[];
}

// ─── Severity (delegated to the single source of truth, AGENTS.md §0) ─
type ScreenSeverity = 'severe' | 'minor' | 'good' | 'unknown';

/** Preferred: numeric code first, text parsing fallback — both via getSeverityColor. */
function lineSeverity(line: LineStatus): ScreenSeverity {
  return getSeverityColor(line.status_severity, line.status).label;
}

function worstSeverity(lines: any[]): ScreenSeverity {
  if (!lines.length) return 'unknown';
  const severities = lines.map((l: any) => lineSeverity(l));
  if (severities.includes('severe')) return 'severe';
  if (severities.includes('minor')) return 'minor';
  return 'good';
}

// ─── Helpers ──────────────────────────────────────────────────────

function cleanDestination(dest: string): string {
  return String(dest || '')
    .replace(' Underground Station', '')
    .replace(' DLR Station', '')
    .replace(' Rail Station', '')
    .replace(/\b(Northbound|Southbound|Eastbound|Westbound)\b\s*[-–—]?\s*/gi, '')
    .replace(/\s*via\s+[a-z0-9'\s]+/gi, '')
    .trim();
}

/** Extract platform number only — strip compass directions */
function cleanPlatform(platform: string): string {
  if (!platform) return '';
  const stripped = String(platform)
    .replace(/\b(Northbound|Southbound|Eastbound|Westbound)\b\s*[-–—]?\s*/gi, '')
    .replace(/Platform\s*/i, 'P')
    .replace(/\s*via\s+[a-z0-9'\s]+/gi, '')
    .replace(/\s*-\s*$/g, '')
    .trim();
  return stripped;
}

// ─── Component ───────────────────────────────────────────────────
export default function StationDetailScreen({
  stationId,
  stationName,
  selectedLines = [],
}: StationDetailScreenProps) {
  const router = useRouter();
  const { top: safeAreaTop } = useSafeAreaInsets();
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [loading, setLoading] = useState(true);

  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const requestIdRef = useRef(0);

  // Read line statuses from the global store (populated by MyCommuteDashboard poller)
  const lineStoreLines = useLineDataStore(state => state.lines);
  const networkSeverity = useMemo<ScreenSeverity>(() => {
    const myLines = selectedLines.length > 0
      ? selectedLines.map(id => lineStoreLines[id]).filter(Boolean)
      : Object.values(lineStoreLines);
    return worstSeverity(myLines);
  }, [lineStoreLines, selectedLines]);

  const showAll = useUserPreferencesStore(
    state => (state as any).stationFilterToggles[stationId] || false
  );
  const toggleFilter = useUserPreferencesStore(
    state => (state as any).toggleStationFilter
  );

  const cleanName = String(stationName ?? '')
    .replace(/\s*(?:Underground Station|Elizabeth line Station|Overground Station|DLR Station|Rail Station|Station)$/i, '')
    .trim();

  // ── Route raw arrivals through the single-source line selector ──
  // (AGENTS.md §0). showAll = explicit "All lines" toggle override →
  // empty selection passes everything through; otherwise only the user's
  // selected lines are visible, BEFORE grouping/rendering.
  const visibleDepartures = useMemo(
    () => getVisibleArrivals(departures, showAll ? [] : selectedLines),
    [departures, showAll, selectedLines]
  );

  // ── Group departures by line ──────────────────────────────────
  const lineGroups: LineGroup[] = useMemo(() => {
    const map = new Map<string, LineGroup>();
    visibleDepartures.forEach(dep => {
      const lineId = dep.lineId;
      if (!map.has(lineId)) {
        map.set(lineId, {
          lineId,
          lineName: dep.lineName,
          lineColor: dep.lineColor,
          departures: [],
        });
      }
      map.get(lineId)!.departures.push(dep);
    });
    return Array.from(map.values());
  }, [visibleDepartures]);

  // ── Filter by ⊞ toggle: Your Lines vs All Departures ─────────
  const filteredGroups = useMemo(() => {
    if (showAll) {
      const pinned = lineGroups.filter(g => selectedLines.includes(g.lineId));
      const unpinned = lineGroups.filter(g => !selectedLines.includes(g.lineId));
      return { pinned, unpinned };
    }
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

  // ── Fetch departures (single source of truth) ─────────────────
  const loadDepartures = useCallback(async (showLoader: boolean = false) => {
    const requestId = ++requestIdRef.current;
    try {
      if (showLoader) setLoading(true);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);

      const data = await fetchNormalizedStationArrivals(stationId, controller.signal);
      clearTimeout(timeoutId);

      if (requestId !== requestIdRef.current) return;

      setDepartures(data.departures);
      setFetchedAt(new Date());
    } catch (e) {
      console.log('[StationDetailScreen] departures error:', e);
    } finally {
      if (requestId === requestIdRef.current) {
        if (showLoader) setLoading(false);
      }
    }
  }, [stationId]);

  useEffect(() => {
    loadDepartures(true);
    const interval = setInterval(() => {
      loadDepartures(false);
    }, 30_000);
    return () => clearInterval(interval);
  }, [stationId, loadDepartures]);

  // ── Render a single arrival row ───────────────────────────────
  const renderArrival = (dep: Departure, idx: number) => {
    const isDue = dep.minutes_away <= 0;
    const platform = cleanPlatform(dep.platform);
    const dest = cleanDestination(dep.destination);

    let timeText: string = '';
    let timeStyle: any[] = [];

    if (isDue) {
      timeText = 'Due';
      timeStyle = [s.depTime, DUE_TIME_STYLE];
    } else {
      timeText = `${dep.minutes_away} min`;
      timeStyle = [s.depTime];
    }

    return (
      <View key={`arr-${idx}`} style={s.arrivalRow} testID={`screen-arrival-${idx}`}>
        <Text style={s.arrivalDest} numberOfLines={1}>
          {dest}
          {dep.via ? <Text style={s.arrivalVia}> {dep.via}</Text> : null}
        </Text>
        {platform ? <Text style={s.arrivalPlatform} numberOfLines={1}>{platform}</Text> : null}
        <Text style={timeStyle} numberOfLines={1}>{timeText}</Text>
      </View>
    );
  };

  // ── Render a line section as a glass card ─────────────────────
  const NIGHT_TUBE_LINES = new Set(['central', 'jubilee', 'northern', 'piccadilly', 'victoria']);

  const formatClockTime = (isoString?: string): string => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '';
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    } catch {
      return '';
    }
  };

  const renderLineSection = (group: LineGroup, idx: number) => {
    const sliced = group.departures.slice(0, 3);

    const firstDep = group.departures[0];
    const lastDep = group.departures.length > 1 ? group.departures[group.departures.length - 1] : null;

    const firstTerminal = firstDep?.firstTrainDestination
      ? cleanDestination(firstDep.firstTrainDestination)
      : (firstDep ? cleanDestination(firstDep.destination) : '');

    const lastTerminal = firstDep?.lastTrainDestination
      ? cleanDestination(firstDep.lastTrainDestination)
      : (lastDep ? cleanDestination(lastDep.destination) : '');

    const firstTime = firstDep?.firstTrain || formatClockTime(firstDep?.expected_arrival);
    const lastTime = firstDep?.lastTrain || formatClockTime(lastDep?.expected_arrival) || lastDep?.lastTrain || formatClockTime(firstDep?.expected_arrival);

    const isNightTube = firstDep?.isNightTube ?? NIGHT_TUBE_LINES.has(group.lineId);

    return (
      <View
        key={group.lineId}
        testID={`screen-line-${group.lineId}`}
        style={idx > 0 ? { marginTop: 14 } : undefined}
      >
        <View style={s.lineCardInner}>
          <BlurView intensity={GLASS.blurIntensity} tint="dark" style={StyleSheet.absoluteFillObject} />
          {/* Line header: color bar + name in small caps */}
          <View style={s.lineHeader}>
            <View style={[s.lineColorBar, { backgroundColor: group.lineColor }]} />
            <Text style={s.lineHeaderName}>{group.lineName.toUpperCase()}</Text>
            {isNightTube && <Text style={s.nightTubeBadge}>24hr Service</Text>}
          </View>

          {/* Subtle line divider to give definition to the line name */}
          <View style={s.lineHeaderDivider} />

          {sliced.map((dep, arrIdx) => renderArrival(dep, arrIdx))}

          {/* Internal divider between arrivals and footer */}
          <View style={s.hairline} />

          {/* First / Last footer */}
          {(firstTerminal || lastTerminal) && (
            <View style={s.footerRow}>
              {firstTerminal ? (
                <Text style={s.footerText}>First → {firstTerminal} · {firstTime}</Text>
              ) : null}
              {lastTerminal && (lastTerminal !== firstTerminal || lastTime !== firstTime) ? (
                <Text style={s.footerText}>Last → {lastTerminal} · {lastTime}</Text>
              ) : null}
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={s.root} testID="station-detail-screen">
      {/* Background gradient — same as MyCommuteDashboard */}
      <DashboardGradient severity={networkSeverity} />

      {/* Header bar */}
      <View style={[s.headerContainer, { paddingTop: safeAreaTop }]}>
        <View style={s.header}>
          {/* Left: back button */}
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={s.backLink}
            testID="station-screen-back"
          >
            <Text style={s.backLinkText}>‹ Back</Text>
          </Pressable>

          {/* Center: station eyebrow + name (perfectly centered on screen) */}
          <View style={s.stationNameContainer}>
            <Text style={s.eyebrowLabel}>STATION</Text>
            <Text style={s.stationName} numberOfLines={1} testID="screen-station-name">
              {cleanName}
            </Text>
          </View>
        </View>
      </View>

      {/* Segmented Control */}
      <View style={s.segmentContainer}>
        <View style={s.segmentTrack}>
          <Pressable
            onPress={() => {
              if (showAll) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                toggleFilter(stationId);
              }
            }}
            style={[s.segmentTab, !showAll && s.segmentTabActive]}
          >
            <Text style={[s.segmentTabText, !showAll ? s.segmentTabTextActive : s.segmentTabTextInactive]}>
              Your lines
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (!showAll) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                toggleFilter(stationId);
              }
            }}
            style={[s.segmentTab, showAll && s.segmentTabActive]}
          >
            <Text style={[s.segmentTabText, showAll ? s.segmentTabTextActive : s.segmentTabTextInactive]}>
              All lines
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Body — full remaining height scroll */}
      {loading ? (
        <View style={s.loadingRow}>
          <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
          <Text style={s.loadingText}>Fetching departures…</Text>
        </View>
      ) : filteredGroups.pinned.length === 0 && filteredGroups.unpinned.length === 0 ? (
        <Text style={s.emptyText} testID="screen-empty">
          No trains right now
        </Text>
      ) : (
        <ScrollView
          style={s.scrollBody}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          testID="screen-scroll-body"
        >
          {filteredGroups.pinned.map((group, idx) => renderLineSection(group, idx))}

          {showAll && filteredGroups.unpinned.length > 0 && (
            <>
              <View style={s.separatorRow}>
                <View style={s.separatorLine} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginHorizontal: 8 }}>
                  <Train size={11} color="rgba(255,255,255,0.25)" />
                  <Text style={s.separatorText}>Other lines</Text>
                </View>
                <View style={s.separatorLine} />
              </View>
              {filteredGroups.unpinned.map((group, idx) =>
                renderLineSection(group, filteredGroups.pinned.length + idx)
              )}
            </>
          )}

          {/* Freshness Footer */}
          {freshnessText ? (
            <Text style={s.freshnessFooter}>Updated {freshnessText}</Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    // No backgroundColor — DashboardGradient provides the full background.
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.10)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    marginTop: 4,
  },
  backLink: {
    position: 'absolute',
    left: 0,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingRight: 16,
  },
  backLinkText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 16,
    color: 'rgba(255,255,255,0.80)',
  },
  stationNameContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '65%',
  },
  eyebrowLabel: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 10,
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  stationName: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 17,
    color: '#FFFFFF',
    letterSpacing: -0.3,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  segmentContainer: {
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  segmentTrack: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 16,
    padding: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  segmentTab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  segmentTabActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.30)',
  },
  segmentTabText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 12,
  },
  segmentTabTextActive: {
    color: '#FFFFFF',
  },
  segmentTabTextInactive: {
    color: 'rgba(255, 255, 255, 0.40)',
  },
  freshnessFooter: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.22)',
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 12,
  },
  scrollBody: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },

  // ── Line section glass card —─────────────────────────────────
  lineCardInner: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },

  lineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  lineHeaderDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginBottom: 8,
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
  nightTubeBadge: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    marginLeft: 6,
    letterSpacing: 0.5,
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
    color: 'rgba(255,255,255,0.45)',
    marginRight: 4,
  },
  arrivalVia: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.45)',
  },
  depTime: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '500',
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
    marginTop: 40,
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
    marginTop: 40,
  },
});
