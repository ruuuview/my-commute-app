/**
 * MyCommuteDashboard.tsx
 * ─────────────────────────────────────────────────────────────────
 * "Refined Transit Intelligence" — Bloomberg Terminal × Apple Maps
 * ─────────────────────────────────────────────────────────────────
 */

import React, { useCallback, useEffect, useState, useMemo, memo, useRef } from 'react';
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
  Modal
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
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
import { GLASS, PREMIUM_BUTTON } from '../theme/colors';

// ✅ Wired directly to our Zustand + MMKV Brain
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { useShallow } from 'zustand/react/shallow';
import { useTflPoller } from '../hooks/useTflPoller';
import type { StatusLevel } from '../hooks/useWorstStatus';
import { Ionicons } from '@expo/vector-icons';
import { useDeferredPermissionTriggers } from '../hooks/useDeferredPermissionTriggers';
// ✅ Modal now managed HERE, not upstream
import { ManageLinesModal } from './ManageLinesModal';
import { ManageStationsModal } from './ManageStationsModal';
import { DashboardGradient } from './DashboardGradient';
import DashboardGrid from './DashboardGrid';
import { LineDetailModal } from './LineDetailModal';
import { DashboardSkeleton } from './DashboardSkeleton';
import LivingDot from './LivingDot';
import { normaliseLineId } from '../utils/normaliseLineId';
import BouncyPressable from './BouncyPressable';
import { usePressAnimation } from '../hooks/usePressAnimation';
import { StatusBezel } from './StatusBezel';
import { resolveTflStopIds } from '../utils/resolveTflStopId';
import { LINE_COLORS } from '../constants/lineColors';
import { APP_CONFIG } from '../config/app.config';
import { useLineDataStore } from '../store/lineDataStore';


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
  reason?: string;
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
  if (text.includes('suspended') || text.includes('closure') || text.includes('closed')) return 'suspended';
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


// ─── Jiggle Hook (LinePills) — ±1.5deg, ±0.5 translate, clean exit ──
const useJiggle = (isEditing: boolean, index: number = 0) => {
  const rotation = useSharedValue(0);
  const jiggleX = useSharedValue(0);
  const jiggleY = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  // Bridge JS boolean → shared value for safe worklet reads
  const isEditingShared = useSharedValue(isEditing ? 1 : 0);
  useEffect(() => {
    isEditingShared.value = isEditing ? 1 : 0;
  }, [isEditing, isEditingShared]);

  useEffect(() => {
    if (reducedMotion) return;

    if (isEditing) {
      const phase = (index * 23) % 150;
      rotation.value = withDelay(
        phase,
        withRepeat(
          withSequence(
            withTiming(-1.5, { duration: 90, easing: Easing.inOut(Easing.sin) }),
            withTiming(1.5, { duration: 90, easing: Easing.inOut(Easing.sin) })
          ),
          -1,
          false
        )
      );
      jiggleX.value = withDelay(
        phase,
        withRepeat(
          withSequence(
            withTiming(0.5, { duration: 90, easing: Easing.inOut(Easing.sin) }),
            withTiming(-0.5, { duration: 90, easing: Easing.inOut(Easing.sin) })
          ),
          -1,
          false
        )
      );
      jiggleY.value = withDelay(
        phase,
        withRepeat(
          withSequence(
            withTiming(-0.5, { duration: 90, easing: Easing.inOut(Easing.sin) }),
            withTiming(0.5, { duration: 90, easing: Easing.inOut(Easing.sin) })
          ),
          -1,
          false
        )
      );
    } else {
      // BUG FIX: cancel BEFORE withSpring reset
      cancelAnimation(rotation);
      cancelAnimation(jiggleX);
      cancelAnimation(jiggleY);
      rotation.value = withSpring(0, { damping: 24, stiffness: 320 });
      jiggleX.value = withSpring(0, { damping: 24, stiffness: 320 });
      jiggleY.value = withSpring(0, { damping: 24, stiffness: 320 });
    }
  }, [isEditing, reducedMotion, rotation, jiggleX, jiggleY, index]);

  return useAnimatedStyle(() => ({
    transform: [
      { rotate: `${rotation.value}deg` },
      { translateX: jiggleX.value },
      { translateY: jiggleY.value },
    ],
  }));
};

// ─── LinePill ───────────────────────────────────────────────────
const LinePill: React.FC<{
  line: LineData;
  isEditing: boolean;
  index: number;
  onDelete: (id: string) => void;
  onLongPress?: () => void;
  onPress?: (info: any) => void;
}> = ({ line, isEditing, index, onDelete, onLongPress, onPress }) => {
  const pillRef = useRef<View>(null);
  const jiggleStyle = useJiggle(isEditing, index);
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation('nav_item');
  const severity = parseSeverity(line.status);
  const statusColor = severity === 'severe' ? '#FF3B30' : severity === 'minor' ? '#F2A002' : severity === 'suspended' ? '#FF3B30' : '#34C759';

  return (
    <Animated.View ref={pillRef as any} style={[pill.shadow, jiggleStyle, animatedStyle]}>
      <Pressable onPress={() => { 
        if (!isEditing && onPress && pillRef.current) {
          pillRef.current.measureInWindow((x, y, width, height) => {
            onPress({ id: line.id, anchorRect: { x, y, width, height } });
          });
        }
      }} onPressIn={onPressIn} onPressOut={onPressOut} onLongPress={onLongPress} style={pill.container}>
        {Platform.OS !== 'android' && (
          <BlurView intensity={GLASS.blurIntensity} tint="dark" style={StyleSheet.absoluteFillObject} />
        )}
        <View style={[pill.colorBar, { backgroundColor: line.color }]} />
        <Text style={pill.name} numberOfLines={1}>{line.name}</Text>
        <View style={pill.spacer} />
        <Text style={[pill.statusText, { color: statusColor }]} numberOfLines={1}>{severity === 'good' ? 'Good service' : line.status}</Text>
        <StatusBezel statusType={line.status} style={{ marginRight: 4 }} />
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
  shadow: {
    borderRadius: 12,
    shadowColor: GLASS.shadowColor,
    shadowOffset: GLASS.shadowOffset,
    shadowOpacity: GLASS.shadowOpacity,
    shadowRadius: GLASS.shadowRadius,
    elevation: 6,
  },
  container: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    backgroundColor: Platform.OS === 'android' ? '#0E0E14' : GLASS.background,
  },
  colorBar: { width: 3, height: 20, borderRadius: 2, marginRight: 10 },
  name: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 14, color: '#FFFFFF' },
  spacer: { flex: 1 },
  statusText: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 12, marginRight: 8 },
  dotOuter: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4
  },
  dotInner: { width: 6, height: 6, borderRadius: 3 },
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
    borderWidth: PREMIUM_BUTTON.borderWidth,
    borderColor: PREMIUM_BUTTON.borderColor,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PREMIUM_BUTTON.background,
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


const SEVERITY_ORDER: Record<string, number> = { suspended: 0, severe: 1, minor: 2, good: 3, unknown: 4 };



// ─── Main Dashboard ───────────────────────────────────────────────
const MyCommuteDashboard: React.FC = () => {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  // Premium scale-up center reveal for dashboard transition
  const revealScale = useSharedValue(0.88);
  const revealOpacity = useSharedValue(0);
  const reducedMotion = useReducedMotion();


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

  const { resetOnboarding, selectedLines, selectedStations, removeLine, removeStation, reorderStations, lastKnownData, setLastKnown } = useUserPreferencesStore(useShallow((s: any) => ({
    resetOnboarding: s.resetOnboarding,
    selectedLines: s.selectedLines || [],
    selectedStations: s.pinnedStations || [],
    removeLine: s.toggleLine,
    removeStation: s.unpinStation,
    reorderStations: s.reorderStations,
    lastKnownData: s.lastKnownData || [],
    setLastKnown: s.setLastKnown,
  })));

  const router = useRouter();
  const [modalVisible, setModalVisible] = useState(false);
  const [stationModalVisible, setStationModalVisible] = useState(false);
  const [data, setData] = useState<DashboardData>({ lines: lastKnownData, stations: [] });
  const [isEditing, setIsEditing] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [selectedLineInfo, setSelectedLineInfo] = useState<{ id: string; anchorRect: any } | null>(null);
  const selectedLineForModal = useMemo(() => data.lines.find(l => l.id === selectedLineInfo?.id) || null, [data.lines, selectedLineInfo]);




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

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    try {
      // 1. Fetch lines
      const response = await fetch(`${APP_CONFIG.BACKEND_URL}/api/lines`, { signal });
      if (!response.ok) {
        return { status: response.status };
      }

      const raw = await response.json();

      const freshLines = raw.map((item: any) => ({
        id: String(item?.id ?? ''),
        name: String(item?.name ?? ''),
        color: LINE_COLORS[String(item?.id ?? '')] || '#888',
        status: String(item?.status ?? ''),
        status_severity: item?.status_severity ?? 10,
        reason: String(item?.reason ?? ''),
      }));

      // Populate global line status store so StationDetailScreen reads live severity
      useLineDataStore.getState().setLines(freshLines);

      // 2. Fetch live arrivals for each pinned station in parallel
      let freshStations: StationData[] = [];
      if (Array.isArray(selectedStations) && selectedStations.length > 0) {
        const stationPromises = selectedStations.map(async (st: any) => {
          try {
            const resolvedIds = resolveTflStopIds(st.id);
            const responses = await Promise.all(
              resolvedIds.map(id =>
                fetch(`${APP_CONFIG.BACKEND_URL}/api/stations/${id}`, { signal })
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
              const mins = dep.minutes_away ?? 0;
              const dueKey = mins <= 0 ? 'due' : mins;
              const key = `${dep.line}-${dep.destination}-${dueKey}`;
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

  // ── Backdrop tap exits jiggle ─────────────────────────────────
  const handleBackdropPress = useCallback(() => {
    if (isEditing) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setIsEditing(false);
    }
  }, [isEditing]);
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
          ref={scrollRef}
          style={[dash.scroll, { zIndex: 1 }]}
          contentContainerStyle={[dash.scrollContent, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={scrollEnabled}
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

              <BouncyPressable onPress={() => setModalVisible(true)} style={dash.primaryBtn}>
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
                onPressAdd={() => setModalVisible(true)}
                isEditing={isEditing}
              />
              {sortedLines.map((line, idx) => (
                <LinePill key={line.id} line={line} index={idx} isEditing={isEditing} onDelete={removeLine} onLongPress={handleEdit} onPress={(info: any) => setSelectedLineInfo(info)} />
              ))}
            </View>
          )}

          {/* Spacer between sections — catches backdrop taps */}
          {isEditing && sortedLines.length > 0 && (
            <Pressable style={{ height: 24 }} onPress={handleBackdropPress} />
          )}

          {sortedLines.length > 0 && (
            <View style={dash.section}>
              <SectionHeader 
                title="My stations" 
                icon={<Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.35)" />} 
                onPressAdd={() => setStationModalVisible(true)}
                isEditing={isEditing}
              />
              {selectedStations.length === 0 ? (
                <Pressable
                  onPress={() => setStationModalVisible(true)}
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
                <DashboardGrid
                  stations={selectedStations}
                  isJiggling={isEditing}
                  onExitJiggle={() => setIsEditing(false)}
                  onDelete={removeStation}
                  onLongPressCard={() => setIsEditing(true)}
                  onScrollEnabledChange={setScrollEnabled}
                  selectedLines={selectedLines}
                  onReorderStations={reorderStations}
                  simultaneousHandlers={scrollRef}
                  onStationTap={(stationId, stationName) =>
                    router.push(
                      `/station-detail?stationId=${encodeURIComponent(stationId)}&stationName=${encodeURIComponent(stationName)}`
                    )
                  }
                />
              )}
            </View>
          )}

          {/* Bottom spacer — catches backdrop taps below all cards */}
          {isEditing && (
            <Pressable
              style={{ flex: 1, minHeight: 250 }}
              onPress={handleBackdropPress}
            />
          )}
        </ScrollView>

        {/* Full-screen absolute backdrop behind scroll — catches all empty space */}
        {isEditing && (
          <Pressable
            style={[StyleSheet.absoluteFillObject, { zIndex: 0 }]}
            onPress={handleBackdropPress}
          />
        )}



        <ManageLinesModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
        />

        <ManageStationsModal
          visible={stationModalVisible}
          onClose={() => setStationModalVisible(false)}
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

        {/* Line Detail Modal */}
        {selectedLineForModal && selectedLineInfo && (
          <LineDetailModal
            visible={!!selectedLineInfo}
            onClose={() => setSelectedLineInfo(null)}
            line={{
              id: selectedLineForModal.id,
              name: selectedLineForModal.name,
              color: selectedLineForModal.color,
              status: selectedLineForModal.status,
              reason: selectedLineForModal.reason,
            }}
            statusType={parseSeverity(selectedLineForModal.status)}
            statusLabel={selectedLineForModal.status}
            anchorRect={selectedLineInfo.anchorRect}
          />
        )}
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
    borderWidth: PREMIUM_BUTTON.borderWidth,
    borderColor: PREMIUM_BUTTON.borderColor,
    backgroundColor: PREMIUM_BUTTON.background,
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerBtnText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 12,
    color: 'rgba(255,255,255,0.80)'
  },
  subheadingArea: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },

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