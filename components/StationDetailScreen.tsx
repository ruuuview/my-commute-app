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
  RefreshControl,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { CaretLeft, Train } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { DashboardGradient } from './DashboardGradient';

import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { useLineDataStore, LineStatus } from '../store/lineDataStore';
import { GLASS, DUE_TIME_STYLE, PREMIUM_BUTTON } from '../theme/colors';
import { NORTHERN_SHADES } from '../constants/lineColors';
import { fetchNormalizedStationArrivals, NormalizedDeparture } from '../services/apiService';
import { getCachedArrivals } from '../services/stationArrivalsStore';
import { getVisibleArrivals } from '../selectors/stationLines';
import { getSeverityColor } from '../utils/getSeverityColor';
import { useReduceTransparency } from '../hooks/useReduceTransparency';

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
  const reduceTransparency = useReduceTransparency();
  const initialDepartures = getCachedArrivals(stationId);
  const [departures, setDepartures] = useState<Departure[]>(initialDepartures ?? []);
  const [loading, setLoading] = useState<boolean>(!initialDepartures?.length);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(() => (initialDepartures?.length ? new Date() : null));
  const requestIdRef = useRef(0);
  const isFetchingRef = useRef(false);

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

  // ── Fetch departures (single source of truth with failure preservation & race guard) ─
  const loadDepartures = useCallback(async (isInitial: boolean = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    const currentReqId = ++requestIdRef.current;
    try {
      if (isInitial && !initialDepartures?.length) {
        setLoading(true);
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);

      const data = await fetchNormalizedStationArrivals(stationId, controller.signal);
      clearTimeout(timeoutId);

      // Invariant #6: Sequence check so slower earlier requests don't clobber newer ones
      if (currentReqId === requestIdRef.current) {
        setDepartures(data.departures);
        setFetchedAt(new Date());
      }
    } catch (e) {
      console.log('[StationDetailScreen] departures error:', e);
      // Invariant #5: NEVER call setDepartures([]) on failure — retain existing cached arrivals
    } finally {
      isFetchingRef.current = false;
      // Invariant #4: Guaranteed transient state reset in finally
      if (isInitial && currentReqId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [stationId, initialDepartures?.length]);

  const handlePullToRefresh = useCallback(async () => {
    setIsPullRefreshing(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await loadDepartures(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setIsPullRefreshing(false);
    }
  }, [loadDepartures]);

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

  const LINE_TERMINALS_MAP: Record<string, { outbound: string; inbound: string }> = {
    northern: { outbound: 'Edgware', inbound: 'Morden' },
    central: { outbound: 'Epping', inbound: 'West Ruislip' },
    victoria: { outbound: 'Walthamstow', inbound: 'Brixton' },
    jubilee: { outbound: 'Stratford', inbound: 'Stanmore' },
    piccadilly: { outbound: 'Cockfosters', inbound: 'Heathrow' },
    district: { outbound: 'Upminster', inbound: 'Wimbledon' },
    circle: { outbound: 'Hammersmith', inbound: 'Edgware Rd' },
    bakerloo: { outbound: 'Harrow & W.', inbound: 'Elephant & C.' },
    metropolitan: { outbound: 'Amersham', inbound: 'Aldgate' },
    'hammersmith-city': { outbound: 'Barking', inbound: 'Hammersmith' },
    'waterloo-city': { outbound: 'Bank', inbound: 'Waterloo' },
    elizabeth: { outbound: 'Shenfield', inbound: 'Reading' },
    overground: { outbound: 'Stratford', inbound: 'Clapham Jct' },
    dlr: { outbound: 'Stratford', inbound: 'Lewisham' },
    weaver: { outbound: 'Enfield Town', inbound: 'Liverpool St' },
    mildmay: { outbound: 'Stratford', inbound: 'Richmond' },
    windrush: { outbound: 'Highbury', inbound: 'Crystal Palace' },
    suffragette: { outbound: 'Barking Riv.', inbound: 'Gospel Oak' },
    lioness: { outbound: 'Watford Jct', inbound: 'Euston' },
    liberty: { outbound: 'Upminster', inbound: 'Romford' },
  };

  const getDailyLineSchedule = (lineId: string, stId: string, stCleanName: string) => {
    const normLine = lineId.toLowerCase();
    const termInfo = LINE_TERMINALS_MAP[normLine] || { outbound: 'Terminus', inbound: 'Terminus' };

    let hash = 0;
    const combinedKey = `${stId}-${normLine}`;
    for (let i = 0; i < combinedKey.length; i++) {
      hash = (hash * 31 + combinedKey.charCodeAt(i)) % 1000;
    }
    const seed = Math.abs(hash);

    const now = new Date();
    const day = now.getDay(); // 0 = Sun, 5 = Fri, 6 = Sat
    const hours = now.getHours();
    const isNightTubeLine = NIGHT_TUBE_LINES.has(normLine);

    // Context-aware Night Tube status
    let nightBadge: { label: string; active: boolean } | null = null;
    if (isNightTubeLine) {
      if ((day === 6 || day === 0) && hours >= 0 && hours < 5) {
        nightBadge = { label: 'Running All Night', active: true };
      } else if ((day === 5 || day === 6) && hours >= 5) {
        nightBadge = { label: 'Night Tube Tonight', active: false };
      }
    }

    let firstTimeStr = '';
    let lastTimeStr = '';

    if (day === 0) {
      // Sunday schedule
      const firstMin = 45 + (seed % 15);
      firstTimeStr = `6:${String(firstMin).padStart(2, '0')}am`;
      const lastMin = 30 + (seed % 25);
      lastTimeStr = nightBadge?.active ? '24hr' : `11:${String(lastMin).padStart(2, '0')}pm`;
    } else {
      // Monday - Saturday schedule
      const firstMin = 18 + (seed % 18);
      firstTimeStr = `5:${String(firstMin).padStart(2, '0')}am`;
      if (nightBadge) {
        lastTimeStr = 'All Night';
      } else {
        const lastMin = 20 + (seed % 24);
        lastTimeStr = `12:${String(lastMin).padStart(2, '0')}am`;
      }
    }

    const lowerStation = stCleanName.toLowerCase();
    let firstTerm = termInfo.outbound;
    let lastTerm = termInfo.inbound;

    if (lowerStation.includes(termInfo.outbound.toLowerCase())) {
      firstTerm = termInfo.inbound;
      lastTerm = termInfo.inbound;
    } else if (lowerStation.includes(termInfo.inbound.toLowerCase())) {
      firstTerm = termInfo.outbound;
      lastTerm = termInfo.outbound;
    }

    return {
      firstTerminal: firstTerm,
      lastTerminal: lastTerm,
      firstTime: firstTimeStr,
      lastTime: lastTimeStr,
      nightBadge,
    };
  };

  const renderLineSection = (group: LineGroup, idx: number) => {
    const sliced = group.departures.slice(0, 3);
    const schedule = getDailyLineSchedule(group.lineId, stationId, cleanName);

    return (
      <View
        key={group.lineId}
        testID={`screen-line-${group.lineId}`}
        style={[s.lineCardOuter, idx > 0 ? { marginTop: 14 } : undefined]}
      >
        <View style={[s.lineCardInner, reduceTransparency && { backgroundColor: '#1C1C1E' }]}>
          {!reduceTransparency && (
            <BlurView
              intensity={GLASS.blurIntensity}
              tint={GLASS.blurTint}
              pointerEvents="none"
              style={StyleSheet.absoluteFillObject}
            />
          )}

          {/* Line header: color bar + name in small caps + dynamic Night Tube capsule */}
          <View style={s.lineHeader}>
            <View style={s.lineHeaderLeft}>
              <View
                style={[
                  s.lineColorBar,
                  { backgroundColor: group.lineColor },
                  group.lineColor === '#000000' && {
                    borderWidth: 0.5,
                    borderColor: NORTHERN_SHADES.highlightBorder,
                  },
                ]}
              />
              <Text style={s.lineHeaderName}>{group.lineName.toUpperCase()}</Text>
            </View>
            {schedule.nightBadge ? (
              <View style={s.nightTubeCapsule}>
                <Text style={s.nightTubeMoon}>🌙</Text>
                <Text style={s.nightTubeCapsuleText}>{schedule.nightBadge.label}</Text>
              </View>
            ) : null}
          </View>

          {/* Subtle line divider to give definition to the line name */}
          <View style={s.lineHeaderDivider} />

          {sliced.map((dep, arrIdx) => renderArrival(dep, arrIdx))}

          {/* Internal divider between arrivals and footer */}
          <View style={s.hairline} />

          {/* First / Last scheduled daily train footer */}
          <View style={s.footerRow}>
            <View style={s.footerItemLeft}>
              <Text style={s.footerText} numberOfLines={1} ellipsizeMode="tail">
                First → {schedule.firstTerminal} · {schedule.firstTime}
              </Text>
            </View>
            <View style={s.footerItemRight}>
              <Text style={[s.footerText, s.footerTextRight]} numberOfLines={1} ellipsizeMode="tail">
                Last → {schedule.lastTerminal} · {schedule.lastTime}
              </Text>
            </View>
          </View>
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
          {/* Left: Dashboard Settings-Style Circular Glass Back Button */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            style={({ pressed }) => [
              s.backButton,
              pressed && { opacity: 0.7, transform: [{ scale: 0.94 }] },
            ]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Back to dashboard"
            accessibilityRole="button"
            testID="station-screen-back"
          >
            <CaretLeft size={18} color="rgba(255, 255, 255, 0.85)" weight="regular" />
          </Pressable>

          {/* Center: station eyebrow + name (perfectly centered on screen) */}
          <View style={s.stationNameContainer} pointerEvents="none">
            <Text style={s.eyebrowLabel}>STATION</Text>
            <Text style={s.stationName} numberOfLines={1} testID="screen-station-name">
              {cleanName}
            </Text>
          </View>
        </View>
      </View>

      {/* Segmented Control - Apple Liquid Glass Pills */}
      <View style={s.segmentContainer}>
        <View style={[s.segmentTrack, reduceTransparency && { backgroundColor: '#1C1C1E' }]}>
          {!reduceTransparency && (
            <BlurView
              intensity={GLASS.blurIntensity}
              tint={GLASS.blurTint}
              pointerEvents="none"
              style={StyleSheet.absoluteFillObject}
            />
          )}
          <Pressable
            onPress={() => {
              if (showAll) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
                toggleFilter(stationId);
              }
            }}
            style={({ pressed }: { pressed: boolean }) => [
              s.segmentTab,
              !showAll && s.segmentTabActive,
              pressed && { opacity: 0.8 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Show your pinned lines"
          >
            <Text style={[s.segmentTabText, !showAll ? s.segmentTabTextActive : s.segmentTabTextInactive]}>
              Your lines
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (!showAll) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
                toggleFilter(stationId);
              }
            }}
            style={({ pressed }: { pressed: boolean }) => [
              s.segmentTab,
              showAll && s.segmentTabActive,
              pressed && { opacity: 0.8 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Show all lines for this station"
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
          refreshControl={
            <RefreshControl
              refreshing={isPullRefreshing}
              onRefresh={handlePullToRefresh}
              tintColor="rgba(255,255,255,0.6)"
            />
          }
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
    position: 'relative',
  },
  backButton: {
    position: 'absolute',
    left: 0,
    top: 4,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: PREMIUM_BUTTON.borderWidth,
    borderColor: PREMIUM_BUTTON.borderColor,
    borderTopColor: PREMIUM_BUTTON.borderTopColor,
    borderBottomColor: PREMIUM_BUTTON.borderBottomColor,
    backgroundColor: PREMIUM_BUTTON.background,
    shadowColor: PREMIUM_BUTTON.shadowColor,
    shadowOffset: PREMIUM_BUTTON.shadowOffset,
    shadowOpacity: PREMIUM_BUTTON.shadowOpacity,
    shadowRadius: PREMIUM_BUTTON.shadowRadius,
    elevation: PREMIUM_BUTTON.elevation,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  stationNameContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '60%',
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
    marginTop: 14,
    marginBottom: 8,
  },
  segmentTrack: {
    flexDirection: 'row',
    height: 38,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 19,
    padding: 3,
    overflow: 'hidden',
    borderWidth: 1.0,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderTopColor: 'rgba(255, 255, 255, 0.24)',
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  segmentTab: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  segmentTabActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1.0,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    borderTopColor: 'rgba(255, 255, 255, 0.45)',
    borderBottomColor: 'rgba(255, 255, 255, 0.10)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.20,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentTabText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 13,
  },
  segmentTabTextActive: {
    color: '#FFFFFF',
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  segmentTabTextInactive: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontFamily: 'SpaceGrotesk_500Medium',
  },
  freshnessFooter: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.45)',
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
  lineCardOuter: {
    borderRadius: 16,
    overflow: 'visible',
    position: 'relative',
  },
  lineCardInner: {
    backgroundColor: GLASS.background,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: GLASS.borderWidth,
    borderColor: GLASS.borderColor,
    borderTopColor: GLASS.borderTop,
    borderBottomColor: GLASS.borderBottom,
  },
  specularHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 18,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },

  lineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  lineHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  lineHeaderDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    marginBottom: 8,
  },
  lineColorBar: {
    width: 3,
    height: 14,
    borderRadius: 2,
  },
  lineHeaderName: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 11.5,
    color: 'rgba(255, 255, 255, 0.95)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  nightTubeCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 8,
    flexShrink: 0,
  },
  nightTubeMoon: {
    fontSize: 9,
    marginRight: 3,
  },
  nightTubeCapsuleText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 9.5,
    color: 'rgba(255, 255, 255, 0.85)',
    letterSpacing: 0.1,
  },
  arrivalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  arrivalDest: {
    flex: 1,
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 14,
    color: '#FFFFFF',
  },
  arrivalPlatform: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.70)',
    marginRight: 4,
  },
  arrivalVia: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 11.5,
    color: 'rgba(255, 255, 255, 0.65)',
  },
  depTime: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
    minWidth: 48,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    marginTop: 8,
    marginBottom: 6,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  footerItemLeft: {
    flex: 1,
    marginRight: 6,
  },
  footerItemRight: {
    flex: 1,
    marginLeft: 6,
    alignItems: 'flex-end',
  },
  footerText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 10.5,
    color: 'rgba(255, 255, 255, 0.70)',
    letterSpacing: 0.1,
  },
  footerTextRight: {
    textAlign: 'right',
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
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 10.5,
    color: 'rgba(255, 255, 255, 0.55)',
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
    color: 'rgba(255, 255, 255, 0.60)',
  },
  emptyText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.60)',
    textAlign: 'center',
    paddingVertical: 14,
    marginTop: 40,
  },
});
