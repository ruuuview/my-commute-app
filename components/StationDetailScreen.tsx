/**
 * StationDetailScreen.tsx
 * ─────────────────────────────────────────────────────────────────
 * Full-screen pushed view for station details.
 * Replaces the anchored popup approach — no flip/position math,
 * no scrim, no BlurView wrapper. Content sits on the DashboardGradient
 * background with per-line glass cards matching DepartureCard/LineCard.
 * ─────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { DashboardGradient } from './DashboardGradient';

import { resolveTflStopIds } from '../utils/resolveTflStopId';
import { normaliseLineId } from '../utils/normaliseLineId';
import { LINE_COLORS } from '../constants/lineColors';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { useLineDataStore } from '../store/lineDataStore';
import { APP_CONFIG } from '../config/app.config';
import { GLASS, PREMIUM_BUTTON } from '../theme/colors';
import { GlassRim } from './GlassRim';

const DUE_GREEN = '#30D158';

interface Departure {
  destination: string;
  line: string;
  platform: string;
  minutes_away: number;
  expected_arrival: string;
  firstTrain?: string;
  lastTrain?: string;
  firstTrainDestination?: string;
  lastTrainDestination?: string;
  isNightTube?: boolean;
}

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

// ─── Severity (copied from MyCommuteDashboard to avoid circular dep) ─
type ScreenSeverity = 'severe' | 'minor' | 'good' | 'offline' | 'suspended' | 'unknown';

function parseSeverity(statusText: string): ScreenSeverity {
  const text = String(statusText ?? '').toLowerCase();
  if (text.includes('good')) return 'good';
  if (text.includes('minor')) return 'minor';
  if (text.includes('suspended') || text.includes('closure')) return 'suspended';
  if (text.includes('severe') || text.includes('delay')) return 'severe';
  return 'good';
}

function worstSeverity(lines: any[]): ScreenSeverity {
  if (!lines.length) return 'unknown';
  const severities = lines.map((l: any) => parseSeverity(l.status));
  if (severities.includes('suspended')) return 'suspended';
  if (severities.includes('severe')) return 'severe';
  if (severities.includes('minor')) return 'minor';
  if (severities.includes('offline')) return 'offline';
  return 'good';
}

// ─── Helpers ──────────────────────────────────────────────────────

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
  const stripped = String(platform)
    .replace(/\b(Northbound|Southbound|Eastbound|Westbound)\b\s*[-–—]?\s*/gi, '')
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
    try {
      if (showLoader) setLoading(true);
      const resolvedIds = resolveTflStopIds(stationId);
      const responses = await Promise.all(
        resolvedIds.map(id =>
          fetch(`${APP_CONFIG.BACKEND_URL}/api/stations/${id}`)
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
        const mins = dep.minutes_away ?? 0;
        const dueKey = mins <= 0 ? 'due' : mins;
        const key = `${dep.line}-${dep.platform || dep.destination}-${dueKey}`;

        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      deduped.sort((a, b) => (a.minutes_away || 0) - (b.minutes_away || 0));
      setDepartures(deduped);
      setFetchedAt(new Date());
    } catch (e) {
      console.log('[StationDetailScreen] departures error:', e);
    } finally {
      if (showLoader) setLoading(false);
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
  const renderArrival = (dep: Departure, idx: number, isFirstDueForLine: boolean) => {
    const isDue = dep.minutes_away <= 0;
    const platform = cleanPlatform(dep.platform);
    const dest = cleanDestination(dep.destination);

    let timeText: string = '';
    let timeStyle: any[] = [];

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
      <View key={`arr-${idx}`} style={s.arrivalRow} testID={`screen-arrival-${idx}`}>
        <Text style={s.arrivalDest} numberOfLines={1}>{dest}</Text>
        {platform ? <Text style={s.arrivalPlatform} numberOfLines={1}>{platform}</Text> : null}
        <Text style={timeStyle} numberOfLines={1}>{timeText}</Text>
      </View>
    );
  };

  // ── Render a line section as a glass card ─────────────────────
  const NIGHT_TUBE_LINES = new Set(['central', 'jubilee', 'northern', 'piccadilly', 'victoria']);

  const renderLineSection = (group: LineGroup, idx: number) => {
    const sliced = group.departures.slice(0, 3);
    let firstDueSeen = false;

    const firstDep = group.departures[0];
    const lastDep = group.departures.length > 1 ? group.departures[group.departures.length - 1] : null;

    const firstTerminal = firstDep?.firstTrainDestination
      ? cleanDestination(firstDep.firstTrainDestination)
      : (firstDep ? cleanDestination(firstDep.destination) : '');

    const lastTerminal = firstDep?.lastTrainDestination
      ? cleanDestination(firstDep.lastTrainDestination)
      : (lastDep ? cleanDestination(lastDep.destination) : '');

    const firstTime = firstDep?.firstTrain || (firstDep ? (firstDep.minutes_away <= 0 ? 'Due' : `${firstDep.minutes_away} min`) : '');
    const lastTime = firstDep?.lastTrain || (lastDep ? (lastDep.minutes_away <= 0 ? 'Due' : `${lastDep.minutes_away} min`) : '');

    const isNightTube = firstDep?.isNightTube ?? NIGHT_TUBE_LINES.has(group.lineId);

    return (
      <View
        key={group.lineId}
        style={idx > 0 ? [s.lineCard, s.lineCardGap] : s.lineCard}
        testID={`screen-line-${group.lineId}`}
      >
        {/* Glass background — exactly matching DepartureCard/LineCard */}
        <BlurView intensity={GLASS.blurIntensity} tint="dark" style={StyleSheet.absoluteFillObject}>
          <GlassRim />
        </BlurView>

        {/* Card inner content */}
        <View style={s.lineCardInner}>
          {/* Line header: color bar + name in small caps */}
          <View style={s.lineHeader}>
            <View style={[s.lineColorBar, { backgroundColor: group.lineColor }]} />
            <Text style={s.lineHeaderName}>{group.lineName.toUpperCase()}</Text>
            {isNightTube && <Text style={s.nightTubeBadge}>24hr Service</Text>}
          </View>

          {/* Subtle line divider to give definition to the line name */}
          <View style={s.lineHeaderDivider} />

          {/* Arrival rows — max 3 */}
          {sliced.map((dep, arrIdx) => {
            const isDue = dep.minutes_away <= 0;
            const isFirstDue = isDue && !firstDueSeen;
            if (isDue) firstDueSeen = true;
            return renderArrival(dep, arrIdx, isFirstDue);
          })}

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
    <View style={[s.root, { paddingTop: safeAreaTop }]} testID="station-detail-screen">
      {/* Background gradient — same as MyCommuteDashboard */}
      <DashboardGradient severity={networkSeverity} />

      {/* Header bar — glass treatment matching rest of app */}
      <BlurView intensity={60} tint="systemMaterialDark" style={s.headerBlur}>
        <View style={s.header}>
          {/* Left: back button */}
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={s.backPill}
            testID="station-screen-back"
          >
            <Text style={s.backPillText}>Commute</Text>
          </Pressable>

          {/* Center: station name + icon (perfectly centered on screen) */}
          <View style={s.stationNameContainer}>
            <Ionicons name="location-outline" size={14} color="rgba(255,255,255,0.45)" style={{ marginRight: 3 }} />
            <Text style={s.stationName} numberOfLines={1} testID="screen-station-name">
              {cleanName}
            </Text>
          </View>

          {/* Right: toggle only */}
          <View style={s.headerRight}>
            <Pressable
              onPress={() => toggleFilter(stationId)}
              hitSlop={8}
              style={[s.toggleBtn, showAll ? s.toggleBtnActive : s.toggleBtnInactive]}
              testID="screen-toggle-filter"
            >
              <Text style={[s.toggleIcon, { color: showAll ? '#FFFFFF' : 'rgba(255,255,255,0.45)' }]}>⊞</Text>
            </Pressable>
          </View>
        </View>
      </BlurView>

      {/* Sub-header row: Toggle label & Refresh indicator (outside the dark banner) */}
      <View style={s.subHeaderContainer}>
        <View style={s.subHeaderRow}>
          <View style={s.filterLabelContainer}>
            <Ionicons name="train-outline" size={11} color="rgba(255,255,255,0.35)" style={{ marginRight: 4 }} />
            <Text style={s.filterLabel}>
              {showAll ? 'All Departures' : 'Your Lines'}
            </Text>
          </View>
          {freshnessText ? (
            <Pressable
              onPress={() => loadDepartures(true)}
              style={s.refreshBtn}
              hitSlop={8}
              testID="screen-refresh-button"
            >
              <Ionicons name="time-outline" size={11} color="rgba(255,255,255,0.35)" style={{ marginRight: 3 }} />
              <Text style={s.freshnessBadge}>{freshnessText}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Body — full remaining height scroll */}
      {loading ? (
        <View style={s.loadingRow}>
          <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
          <Text style={s.loadingText}>Fetching departures…</Text>
        </View>
      ) : departures.length === 0 ? (
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
                  <Ionicons name="train-outline" size={11} color="rgba(255,255,255,0.25)" />
                  <Text style={s.separatorText}>Other lines</Text>
                </View>
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
  );
}

// ─── Styles ───────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    // No backgroundColor — DashboardGradient provides the full background.
  },
  headerBlur: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.10)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
    marginTop: 8,
  },
  backPill: {
    position: 'absolute',
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PREMIUM_BUTTON.background,
    borderWidth: PREMIUM_BUTTON.borderWidth,
    borderColor: PREMIUM_BUTTON.borderColor,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
  },
  backPillText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 12,
    color: 'rgba(255,255,255,0.80)',
  },
  stationNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '65%',
  },
  stationName: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: -0.3,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  headerRight: {
    position: 'absolute',
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: PREMIUM_BUTTON.background,
    borderWidth: PREMIUM_BUTTON.borderWidth,
    borderColor: PREMIUM_BUTTON.borderColor,
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
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  toggleBtnInactive: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  toggleBtnActive: {
    backgroundColor: PREMIUM_BUTTON.background,
    borderColor: PREMIUM_BUTTON.borderColor,
  },
  toggleIcon: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginVertical: 6,
  },
  subHeaderContainer: {
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
  },
  subHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterLabel: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 0,
    marginBottom: 0,
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
  lineCard: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GLASS.borderSide,
    backgroundColor: GLASS.background,
  },
  lineCardGap: {
    marginTop: 14,
  },
  lineCardInner: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
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
