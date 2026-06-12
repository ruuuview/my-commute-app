/**
 * MyCommuteDashboard.tsx
 * ─────────────────────────────────────────────────────────────────
 * "Refined Transit Intelligence" — Bloomberg Terminal × Apple Maps
 * ─────────────────────────────────────────────────────────────────
 */

import React, { useCallback, useEffect, useState, useMemo, memo } from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
  RefreshControl,
  Modal,
  AppState,
  AppStateStatus,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  useReducedMotion,
  cancelAnimation,
  withSpring,
  withDelay
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

// ✅ Wired directly to our Zustand + MMKV Brain
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { useShallow } from 'zustand/react/shallow';
import { useTflPoller } from '../hooks/useTflPoller';
import type { StatusLevel } from '../hooks/useWorstStatus';
import { Ionicons } from '@expo/vector-icons';
import { useDeferredPermissionTriggers } from '../hooks/useDeferredPermissionTriggers';
import { ManageLinesModal } from './ManageLinesModal';
import { ManageStationsModal } from './ManageStationsModal';
import { DashboardGradient } from './DashboardGradient';
import DepartureCard from './DepartureCard';
import { DashboardSkeleton } from './DashboardSkeleton';
import LivingDot from './LivingDot';
import { normaliseLineId } from '../utils/normaliseLineId';
import BouncyPressable from './BouncyPressable';
import { usePressAnimation } from '../hooks/usePressAnimation';
import { resolveTflStopIds } from '../utils/resolveTflStopId';
import { LINE_COLORS } from '../constants/lineColors';
import { TFL_STATIONS, FULL_STATIONS } from '../data/tflStations';
import { scheduleCalendarCommuteAlerts } from '../services/calendarScheduler';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Types ────────────────────────────────────────────────────────
export type Severity = 'severe' | 'minor' | 'good' | 'offline' | 'suspended' | 'unknown';

interface LineData {
  id: string;
  name: string;
  color: string;
  status: string;
}

interface ArrivalEntry {
  lineId: string;
  lineName: string;
  lineColor: string;
  minutesAway: number;
  destination: string;
}

interface StationData {
  id: string;
  name: string;
  arrivals: ArrivalEntry[];
}

interface DashboardData {
  lines: LineData[];
  stations: StationData[];
}

// ─── Severity mapping ─────────────────────────────────────────────
function parseSeverity(statusText: string): Severity {
  const text = String(statusText ?? '').toLowerCase();
  if (text.includes('good')) return 'good';
  if (text.includes('minor')) return 'minor';
  if (text.includes('suspended') || text.includes('closure')) return 'suspended';
  if (text.includes('severe') || text.includes('delay')) return 'severe';
  return 'good';
}

function worstSeverity(lines: LineData[]): Severity {
  if (!lines.length) return 'unknown';
  const severities = lines.map((l) => parseSeverity(l.status));
  if (severities.includes('suspended')) return 'suspended';
  if (severities.includes('severe')) return 'severe';
  if (severities.includes('minor')) return 'minor';
  if (severities.includes('offline')) return 'offline';
  return 'good';
}

// ─── Smart Heartbeat Dot ─────────────────────────────────────────
const NetworkHealthDot = memo(({ severity }: { severity: Severity }) => {
  const opacity = useSharedValue(0.8);
  const reducedMotion = useReducedMotion();

  let color = '#4CAF50';
  let duration = 2400;
  
  if (severity === 'minor') {
    color = '#F2A002';
    duration = 1200;
  } else if (severity === 'severe') {
    color = '#E32017';
    duration = 600;
  } else if (severity === 'suspended') {
    color = '#E32017';
    duration = 300;
  } else if (severity === 'offline' || severity === 'unknown') {
    color = '#9CA3AF';
    duration = 2400;
  }

  useEffect(() => {
    if (reducedMotion) {
      opacity.value = 0.8;
      return;
    }
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration, easing: Easing.inOut(Easing.ease) })
      ),
      -1, true
    );
  }, [severity, opacity, reducedMotion, duration]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }, animStyle]} />;
});
NetworkHealthDot.displayName = 'NetworkHealthDot';

// ─── Status configuration removed in favor of direct styling in LinePill


// ─── Jiggle Hook (Sinusoidal) ─────────────────────────
const useJiggle = (isEditing: boolean) => {
  const rotation = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (isEditing && !reducedMotion) {
      rotation.value = -1.5;
      rotation.value = withRepeat(
        withTiming(1.5, { duration: 140, easing: Easing.inOut(Easing.sin) }),
        -1,
        true
      );
    } else {
      cancelAnimation(rotation);
      rotation.value = withTiming(0, { duration: 150 });
    }
  }, [isEditing, reducedMotion, rotation]);

  return useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }]
  }));
};

// ─── LinePill ───────────────────────────────────────────────────
const LinePill: React.FC<{ line: LineData; isEditing: boolean; onDelete: (id: string) => void; onLongPress?: () => void; }> = ({ line, isEditing, onDelete, onLongPress }) => {
  const jiggleStyle = useJiggle(isEditing);
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation('nav_item');
  const severity = parseSeverity(line.status);
  const statusColor = severity === 'severe' ? '#FF3B30' : severity === 'minor' ? '#F2A002' : severity === 'suspended' ? '#FF3B30' : '#34C759';

  return (
    <Animated.View style={[jiggleStyle, animatedStyle]}>
      <Pressable onPressIn={onPressIn} onPressOut={onPressOut} onLongPress={onLongPress} style={pill.container}>
        <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={[pill.colorBar, { backgroundColor: line.color }]} />
        <Text style={pill.name} numberOfLines={1}>{line.name}</Text>
        <View style={pill.spacer} />
        <Text style={[pill.statusText, { color: statusColor }]} numberOfLines={1}>{severity === 'good' ? 'Good service' : line.status}</Text>
        <View style={[pill.dot, { backgroundColor: statusColor }]} />
        <Text style={pill.chevron}>›</Text>
        {isEditing && (
          <Pressable style={pill.deleteBadge} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); onDelete(line.id); }}>
            <Text style={pill.deleteIcon}>−</Text>
          </Pressable>
        )}
      </Pressable>
    </Animated.View>
  );
};

const pill = StyleSheet.create({
  container: { minHeight: 44, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: 'transparent', borderRadius: 12, marginBottom: 8, overflow: 'hidden', position: 'relative' },
  colorBar: { width: 3, height: 20, borderRadius: 2, marginRight: 10 },
  name: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 14, color: '#FFFFFF' },
  spacer: { flex: 1 },
  statusText: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 12, marginRight: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  chevron: { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 18, color: 'rgba(255,255,255,0.2)' },
  deleteBadge: { position: 'absolute', top: -6, left: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#1E1E1E' },
  deleteIcon: { color: '#fff', fontSize: 14, fontWeight: 'bold', marginTop: -2 },
});

// ─── Reusable DepartureCard handles dynamic station arrivals and visual rendering

// ─── Section header ───────────────────────────────────────────────
const SectionHeader: React.FC<{ title: string; icon: React.ReactNode; onPressAdd?: () => void; isEditing: boolean }> = ({ title, icon, onPressAdd, isEditing }) => (
  <View style={section.row}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
      {icon}
      <Text style={section.title}>{title}</Text>
    </View>
    {onPressAdd && !isEditing && (
      <Pressable onPress={onPressAdd} style={section.addBtn} hitSlop={8}>
        <Text style={section.addBtnText}>+</Text>
      </Pressable>
    )}
  </View>
);
const section = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: 4 },
  title: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 11, letterSpacing: 0.1, color: 'rgba(255,255,255,0.45)' },
  addBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  addBtnText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 18,
    textAlign: 'center',
  },
});

// ─── Stale Status Text ──────────────────────────────────────────────
const StaleStatusText: React.FC<{ staleState: string | null; staleMinutes: number }> = ({ staleState, staleMinutes }) => {
  const opacity = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  const [displayText, setDisplayText] = useState('');

  useEffect(() => {
    if (staleState === 'offline') setDisplayText(`Offline · Data is ${staleMinutes}m old`);
    else if (staleState === 'tfl-error') setDisplayText(`TfL unavailable · Last updated ${staleMinutes}m ago`);
    else if (staleState === 'tfl-delayed') setDisplayText(`TfL data delayed · Last updated ${staleMinutes}m ago`);
  }, [staleState, staleMinutes]);

  useEffect(() => {
    if (staleState !== null) {
      if (reducedMotion) {
        opacity.value = 0.7;
      } else {
        opacity.value = 0.4;
        opacity.value = withRepeat(
          withTiming(0.9, { duration: 3000, easing: Easing.inOut(Easing.sin) }),
          -1,
          true
        );
      }
    } else {
      cancelAnimation(opacity);
      opacity.value = withTiming(0, { duration: 300 });
    }
  }, [staleState, reducedMotion, opacity]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!displayText) return null;

  return (
    <Animated.Text style={[dash.staleText, animStyle]}>
      {displayText}
    </Animated.Text>
  );
};

// ─── Staggered Card Wrapper ──────────────────────────────────────
const StaggeredCardWrapper = memo(({ children, index }: { children: React.ReactNode; index: number }) => {
  const translateY = useSharedValue(16);
  const opacity = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      translateY.value = 0;
      opacity.value = 1;
      return;
    }
    const delay = 120 + index * 60;
    translateY.value = withDelay(delay, withSpring(0, { damping: 22, stiffness: 200 }));
    opacity.value = withDelay(delay, withTiming(1, { duration: 320, easing: Easing.out(Easing.poly(4)) }));
  }, [index, reducedMotion, translateY, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={animatedStyle}>
      {children}
    </Animated.View>
  );
});
StaggeredCardWrapper.displayName = 'StaggeredCardWrapper';

const SEVERITY_ORDER: Record<string, number> = { suspended: 0, severe: 1, minor: 2, good: 3, unknown: 4 };

function getDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

function getSubtitleText(disruptedLines: LineData[], disruptedStations: any[], seed: number): string {
  const allGood = [
    "Tube's peng today.",
    "No dramas, all running sweet.",
    "Bare smooth out there.",
    "Sorted. Get on it.",
    "All clear, wagwan."
  ];
  
  const minor = [
    "[Line]'s a bit dodge.",
    "Slight faff on the [Line].",
    "[Line]'s dragging its feet.",
    "[Line]'s being a bit snakey.",
    "Don't hold your breath on [Line]."
  ];
  
  const severe = [
    "[Line]'s having a proper mare.",
    "[Line]'s cooked.",
    "Rah, [Line]'s a shambles.",
    "[Line]'s butters right now.",
    "[Line]'s gone full muppet."
  ];
  
  const suspended = [
    "[Line]'s dead. Swerve it.",
    "Nah fam, [Line]'s finished.",
    "Forget [Line]. It's cooked.",
    "[Line]'s gone AWOL."
  ];
  
  const stationDisrupted = [
    "[Station]'s a bit hectic right now.",
    "Might wanna swerve [Station] today.",
    "[Station]'s doing the most.",
    "Check before you roll up to [Station]."
  ];
  
  const bothDisrupted = [
    "[Line]'s cooked and [Station]'s chaos. Detour szn.",
    "Rough one — [Line]'s a mare and [Station]'s peak."
  ];
  
  if (disruptedLines.length > 0 && disruptedStations.length > 0) {
    const line = disruptedLines[0].name;
    const station = disruptedStations[0].name.replace(/\s*(?:Underground Station|Elizabeth line Station|Overground Station|DLR Station|Rail Station|Station)$/i, '').trim() + " station";
    const list = bothDisrupted;
    const template = list[seed % list.length];
    return template.replace('[Line]', line).replace('[Station]', station);
  }
  
  if (disruptedLines.length > 0) {
    const worstLine = disruptedLines[0];
    const line = worstLine.name;
    const sev = parseSeverity(worstLine.status);
    let list = minor;
    if (sev === 'suspended') {
      list = suspended;
    } else if (sev === 'severe') {
      list = severe;
    }
    const template = list[seed % list.length];
    return template.replace('[Line]', line);
  }
  
  if (disruptedStations.length > 0) {
    const station = disruptedStations[0].name.replace(/\s*(?:Underground Station|Elizabeth line Station|Overground Station|DLR Station|Rail Station|Station)$/i, '').trim() + " station";
    const list = stationDisrupted;
    const template = list[seed % list.length];
    return template.replace('[Station]', station);
  }
  
  return allGood[seed % allGood.length];
}

// ─── Main Dashboard ───────────────────────────────────────────────
const MyCommuteDashboard: React.FC = () => {
  const insets = useSafeAreaInsets();

  // Premium scale-up center reveal for dashboard transition
  const revealScale = useSharedValue(0.88);
  const revealOpacity = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  const daySeed = useMemo(() => getDayOfYear(), []);

  useEffect(() => {
    if (reducedMotion) {
      revealScale.value = 1;
      revealOpacity.value = 1;
      return;
    }
    revealScale.value = withSpring(1, { damping: 14, stiffness: 110 });
    revealOpacity.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.poly(4)) });
  }, [reducedMotion, revealScale, revealOpacity]);

  const revealStyle = useAnimatedStyle(() => ({
    transform: [{ scale: revealScale.value }],
    opacity: revealOpacity.value,
  }));

  const { resetOnboarding, selectedLines, selectedStations, removeLine, removeStation, lastKnownData, setLastKnown, calendarGranted } = useUserPreferencesStore(useShallow((s: any) => ({
    resetOnboarding: s.resetOnboarding,
    selectedLines: s.selectedLines || [],
    selectedStations: s.pinnedStations || [],
    removeLine: s.toggleLine,
    removeStation: s.unpinStation,
    lastKnownData: s.lastKnownData || [],
    setLastKnown: s.setLastKnown,
    calendarGranted: s.calendarGranted,
  })));


  const [linesModalVisible, setLinesModalVisible] = useState(false);
  const [stationsModalVisible, setStationsModalVisible] = useState(false);
  const [data, setData] = useState<DashboardData>({ lines: lastKnownData, stations: [] });
  const [isEditing, setIsEditing] = useState(false);

  const subtitle = useMemo(() => {
    const myLines = data.lines.filter(l => selectedLines.includes(l.id));
    const disruptedSelected = myLines.filter(l => parseSeverity(l.status) !== 'good');
    
    const severityOrder = ['suspended', 'severe', 'minor'];
    const sortedDisruptedSelected = [...disruptedSelected].sort((a, b) => {
      const sevA = parseSeverity(a.status);
      const sevB = parseSeverity(b.status);
      return severityOrder.indexOf(sevA) - severityOrder.indexOf(sevB);
    });
    
    const disruptedStationsList = selectedStations.filter((st: any) => {
      const dbStation = FULL_STATIONS.find(s => s.id === st.id) || TFL_STATIONS.find(s => s.id === st.id);
      const linesForStation = dbStation ? dbStation.lines : [];
      return linesForStation.some(lineId => {
        const lineObj = data.lines.find(l => l.id === lineId);
        return lineObj && parseSeverity(lineObj.status) !== 'good';
      });
    });
    
    return getSubtitleText(sortedDisruptedSelected, disruptedStationsList, daySeed);
  }, [data, selectedLines, selectedStations, daySeed]);

  // ✅ Deferred Permission Trigger System (Phase 6)
  const {
    shouldShowNotificationPrompt,
    shouldShowCalendarPrompt,
    requestCalendarPermission,
    requestNotificationPermission,
  } = useDeferredPermissionTriggers();

  const myLines = data.lines.filter(l => selectedLines.includes(l.id));
  const hasContent = myLines.length > 0 || selectedStations.length > 0;

  const [showNotifPrompt, setShowNotifPrompt] = useState(false);
  const [showCalPrompt, setShowCalPrompt] = useState(false);

  useEffect(() => {
    if (hasContent) {
      const t = setTimeout(() => {
        if (shouldShowNotificationPrompt()) {
          setShowNotifPrompt(true);
        } else if (shouldShowCalendarPrompt()) {
          setShowCalPrompt(true);
        }
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [hasContent, shouldShowNotificationPrompt, shouldShowCalendarPrompt]);

  // Calendar commute alert scheduler trigger (Phase 11)
  useEffect(() => {
    if (calendarGranted) {
      scheduleCalendarCommuteAlerts();
    }

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && calendarGranted) {
        scheduleCalendarCommuteAlerts();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [calendarGranted]);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    try {
      // 1. Fetch lines
      const response = await fetch('https://my-commute-backend.vercel.app/api/lines', { signal });
      if (!response.ok) {
        return { status: response.status };
      }

      const raw = await response.json();

      const freshLines = raw.map((item: any) => ({
        id: String(item?.id ?? ''),
        name: String(item?.name ?? ''),
        color: LINE_COLORS[String(item?.id ?? '')] || '#888',
        status: String(item?.status ?? ''),
      }));

      // 2. Fetch live arrivals for each pinned station in parallel
      let freshStations: StationData[] = [];
      if (Array.isArray(selectedStations) && selectedStations.length > 0) {
        const stationPromises = selectedStations.map(async (st: any) => {
          try {
            const resolvedIds = resolveTflStopIds(st.id);
            const responses = await Promise.all(
              resolvedIds.map(id =>
                fetch(`https://my-commute-backend.vercel.app/api/stations/${id}`, { signal })
                  .then(res => (res.ok ? res.json() : null))
                  .catch(() => null)
              )
            );

            const allRawDepartures: any[] = [];
            responses.forEach(sData => {
              if (sData && Array.isArray(sData.departures)) {
                allRawDepartures.push(...sData.departures);
              }
            });

            const dedupedRaw: any[] = [];
            const seenKeys = new Set<string>();

            allRawDepartures.forEach(dep => {
              const dest = String(dep.destination || '');
              if (dest.includes('DELETE') || dest.includes('⚠️')) {
                return;
              }
              // Deduplicate by line, destination, and minutes_away to prevent duplicate-looking rows
              const key = `${dep.line}-${dep.destination}-${dep.minutes_away ?? dep.expected_arrival}`;
              if (!seenKeys.has(key)) {
                seenKeys.add(key);
                dedupedRaw.push(dep);
              }
            });

            dedupedRaw.sort((a, b) => (a.minutes_away || 0) - (b.minutes_away || 0));

            // Map arrivals
            const arrivals = dedupedRaw.map((dep: any) => {
              const { lineId, cleanLineId } = normaliseLineId(dep.line);
              return {
                lineId,
                lineName: dep.line,
                lineColor: LINE_COLORS[cleanLineId] || '#888',
                minutesAway: dep.minutes_away,
                destination: String(dep.destination || '').replace(' Underground Station', '').replace(' DLR Station', ''),
                expectedArrival: dep.expected_arrival
              };
            });

            return {
              id: st.id,
              name: st.name,
              arrivals: arrivals
            };
          } catch (e) {
            console.log('Error fetching station arrivals for', st.id, e);
            return null;
          }
        });
        const resolved = await Promise.all(stationPromises);
        freshStations = resolved.filter(Boolean) as StationData[];
      }

      const fresh: DashboardData = {
        lines: freshLines,
        stations: freshStations,
      };
      setData(fresh);

      const myFreshLines = freshLines.filter((l: any) => selectedLines.includes(l.id));
      const worst = worstSeverity(myFreshLines);
      setLastKnown(worst as StatusLevel, freshLines);

      return { status: response.status, lastUpdated: raw[0]?.updated_at };
    } catch (err: any) {
      console.log('Fetch error');
      throw err;
    }
  }, [selectedStations, selectedLines, setLastKnown]);

  const { forceRefresh, isLoading, staleState, staleMinutes } = useTflPoller(fetchData);

  const onRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await forceRefresh();
  }, [forceRefresh]);

  const handleEdit = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsEditing((v) => !v);
  }, []);



  const networkSeverity = useMemo(() => worstSeverity(myLines), [myLines]);

  const sortedLines = useMemo(() => [...myLines].sort((a, b) => {
    const sevA = parseSeverity(a.status);
    const sevB = parseSeverity(b.status);
    return (SEVERITY_ORDER[sevA] ?? 4) - (SEVERITY_ORDER[sevB] ?? 4);
  }), [myLines]);

  return (
    <View style={dash.root}>
      <DashboardGradient severity={networkSeverity} />
      <Animated.View style={[{ flex: 1, paddingTop: insets.top }, revealStyle]}>
        {/* ── Content ── */}
        <ScrollView
          style={dash.scroll}
          contentContainerStyle={[dash.scrollContent, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor="rgba(255,255,255,0.6)" />}
        >
          {/* ── Global header ── */}
          <View style={[dash.header, { paddingHorizontal: 4 }]}>
            <View style={dash.titleRow}>
              <Text style={dash.titleMain}>My Commute</Text>
              <View style={dash.headerActions}>
                {hasContent && (
                  <Pressable onPress={handleEdit} style={dash.headerBtn} hitSlop={8}>
                    <Text style={dash.headerBtnText}>{isEditing ? 'Done' : 'Edit'}</Text>
                  </Pressable>
                )}
              </View>
            </View>
            <View style={dash.subheadingArea}>
              {hasContent && <NetworkHealthDot severity={networkSeverity} />}
              <Text style={dash.statusTextText}>{subtitle}</Text>
              <StaleStatusText staleState={staleState} staleMinutes={staleMinutes} />
            </View>
          </View>
          {!hasContent && (
            <View style={dash.premiumEmptyState}>
              <View style={[StyleSheet.absoluteFillObject, { opacity: 0.1 }]} pointerEvents="none">
                <DashboardSkeleton />
              </View>
              <View style={dash.emptyVisual}>
                <LivingDot color="rgba(255,255,255,0.8)" size={48} />
              </View>
              <Text style={dash.emptyTitle}>Your commute is a blank slate.</Text>

              <BouncyPressable onPress={() => setLinesModalVisible(true)} style={dash.primaryBtn}>
                <Text style={dash.primaryBtnTxt}>Add Your First Line</Text>
              </BouncyPressable>

              <BouncyPressable onPress={() => resetOnboarding()} style={[dash.ghostBtn, { marginTop: 16 }]}>
                <Text style={[dash.ghostBtnTxt, { color: '#ff4444' }]}>Reset Onboarding (Debug)</Text>
              </BouncyPressable>
            </View>
          )}

          {sortedLines.length > 0 && (
            <View style={dash.section}>
              <SectionHeader 
                title="My lines" 
                icon={<Ionicons name="train-outline" size={13} color="rgba(255,255,255,0.35)" />} 
                onPressAdd={() => setLinesModalVisible(true)}
                isEditing={isEditing}
              />
              {sortedLines.map((line) => (
                <LinePill key={line.id} line={line} isEditing={isEditing} onDelete={removeLine} onLongPress={handleEdit} />
              ))}
            </View>
          )}

          {sortedLines.length > 0 && (
            <View style={dash.section}>
              <SectionHeader 
                title="My stations" 
                icon={<Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.35)" />} 
                onPressAdd={() => setStationsModalVisible(true)}
                isEditing={isEditing}
              />
              {selectedStations.length === 0 ? (
                <Pressable
                  onPress={() => setStationsModalVisible(true)}
                  style={dash.addStationCard}
                >
                  <BlurView
                    intensity={20}
                    tint="dark"
                    style={[StyleSheet.absoluteFillObject, dash.addCardBlur]}
                  />
                  <Ionicons name="add" size={20} color="rgba(255,255,255,0.40)" style={dash.addCardIcon} />
                  <Text style={dash.addCardText}>Add your first station</Text>
                </Pressable>
              ) : (
                selectedStations.map((station: any, index: number) => (
                  <StaggeredCardWrapper key={station.id} index={index}>
                    <DepartureCard
                      stationId={station.id}
                      stationName={station.name}
                      isEditing={isEditing}
                      onDelete={removeStation}
                      onLongPress={handleEdit}
                      defaultExpanded={true}
                    />
                  </StaggeredCardWrapper>
                ))
              )}
            </View>
          )}
        </ScrollView>

        {/* ✅ Modals rendered HERE with immediate state sync */}
        <ManageLinesModal
          visible={linesModalVisible}
          onClose={() => setLinesModalVisible(false)}
        />
        <ManageStationsModal
          visible={stationsModalVisible}
          onClose={() => setStationsModalVisible(false)}
        />

        {/* Deferred Notification Modal */}
        <Modal
          visible={showNotifPrompt}
          transparent
          animationType="fade"
          onRequestClose={() => setShowNotifPrompt(false)}
        >
          <View style={dash.promptScrim}>
            <View style={dash.promptCard}>
              <Ionicons name="notifications-outline" size={32} color="#F2A002" style={dash.promptIcon} />
              <Text style={dash.promptTitle}>Don&apos;t get stuck.</Text>
              <Text style={dash.promptText}>
                TfL lines have delays right now. Want an alert next time?
              </Text>
              <View style={dash.promptActions}>
                <Pressable
                  style={[dash.promptBtn, dash.promptBtnPrimary]}
                  onPress={async () => {
                    await requestNotificationPermission();
                    setShowNotifPrompt(false);
                  }}
                >
                  <Text style={dash.promptBtnTextPrimary}>Notify me</Text>
                </Pressable>
                <Pressable
                  style={dash.promptBtn}
                  onPress={() => setShowNotifPrompt(false)}
                >
                  <Text style={dash.promptBtnTextSecondary}>Maybe later</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Deferred Calendar Modal */}
        <Modal
          visible={showCalPrompt}
          transparent
          animationType="fade"
          onRequestClose={() => setShowCalPrompt(false)}
        >
          <View style={dash.promptScrim}>
            <View style={dash.promptCard}>
              <Ionicons name="calendar-outline" size={32} color="#0098D4" style={dash.promptIcon} />
              <Text style={dash.promptTitle}>Know before you leave.</Text>
              <Text style={dash.promptText}>
                Your calendar stays on your device. We match your schedule to live departures.
              </Text>
              <View style={dash.promptActions}>
                <Pressable
                  style={[dash.promptBtn, dash.promptBtnPrimary]}
                  onPress={async () => {
                    await requestCalendarPermission();
                    setShowCalPrompt(false);
                  }}
                >
                  <Text style={dash.promptBtnTextPrimary}>Allow Calendar Access</Text>
                </Pressable>
                <Pressable
                  style={dash.promptBtn}
                  onPress={() => setShowCalPrompt(false)}
                >
                  <Text style={dash.promptBtnTextSecondary}>Maybe later</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </Animated.View>
    </View>
  );
};

const dash = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0F' },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  titleMain: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 28, color: '#FFFFFF', letterSpacing: -0.5, lineHeight: 32 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerBtnText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 12,
    color: 'rgba(255,255,255,0.80)'
  },
  subheadingArea: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  statusTextText: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 14, color: 'rgba(255,255,255,0.6)' },
  staleText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 12,
    color: '#FF9500',
    marginTop: 4,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },
  section: { marginBottom: 24 },
  premiumEmptyState: { marginTop: 60, alignItems: 'center', paddingHorizontal: 16 },
  emptyVisual: { marginBottom: 32 },
  emptyTitle: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 18, color: 'rgba(255,255,255,0.9)', textAlign: 'center', marginBottom: 32 },
  primaryBtn: { height: 56, width: '100%', borderRadius: 16, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  primaryBtnTxt: { fontSize: 16, fontFamily: 'SpaceGrotesk_700Bold', color: '#0A0A0F' },
  ghostBtn: { height: 44, width: '100%', alignItems: 'center', justifyContent: 'center' },
  ghostBtnTxt: { fontSize: 16, fontFamily: 'SpaceGrotesk_600SemiBold', color: 'rgba(255,255,255,0.6)' },
  promptScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  promptCard: { backgroundColor: '#141424', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 24, width: '100%', maxWidth: 340, alignItems: 'center' },
  promptIcon: { marginBottom: 16 },
  promptTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20, color: '#FFFFFF', textAlign: 'center', marginBottom: 12 },
  promptText: { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 14, color: 'rgba(255,255,255,0.6)', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  promptActions: { width: '100%', gap: 12 },
  promptBtn: { height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', width: '100%' },
  promptBtnPrimary: { backgroundColor: '#FFFFFF' },
  promptBtnTextPrimary: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 15, color: '#0A0A0F' },
  promptBtnTextSecondary: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 14, color: 'rgba(255,255,255,0.5)' },
  addStationCard: {
    alignSelf: 'stretch',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
    height: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    position: 'relative',
    overflow: 'hidden',
    marginBottom: 12,
  },
  addCardBlur: {
    backgroundColor: Platform.OS === 'android' ? 'rgba(15,20,70,0.85)' : 'rgba(255,255,255,0.07)',
  },
  addCardIcon: {
    marginRight: 10,
  },
  addCardText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.50)',
    fontFamily: 'SpaceGrotesk_600SemiBold',
  },
});

export default MyCommuteDashboard;