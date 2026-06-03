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
  Modal
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
// ✅ Modal now managed HERE, not upstream
import AddManageModal from '../app/AddManageModal';
import { GradientBackground } from './GradientBackground';
import DepartureCard from './DepartureCard';
import { DashboardSkeleton } from './DashboardSkeleton';
import LivingDot from './LivingDot';
import BouncyPressable from './BouncyPressable';
import { usePressAnimation } from '../hooks/usePressAnimation';

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
  const opacity = useSharedValue(0.3);

  const color = severity === 'severe' ? '#FF3B30' : severity === 'minor' ? '#FF9500' : '#34C759';

  useEffect(() => {
    const duration = severity === 'severe' ? 600 : severity === 'minor' ? 1200 : 2400;
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration, easing: Easing.inOut(Easing.ease) })
      ),
      -1, true
    );
  }, [severity, opacity]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }, animStyle]} />;
});
NetworkHealthDot.displayName = 'NetworkHealthDot';

// ─── Status configuration removed in favor of direct styling in LinePill

const TFL_COLORS: Record<string, string> = {
  bakerloo: '#B36305', central: '#E32017', circle: '#FFD300', district: '#00782A',
  'hammersmith-city': '#F3A9BB', jubilee: '#A0A5A9', metropolitan: '#9B0056',
  northern: '#1A1A1A', piccadilly: '#003688', victoria: '#0098D4', 'waterloo-city': '#95CDBA',
  elizabeth: '#6950A1', overground: '#EE7C0E', dlr: '#00A4A7',
};


// ─── Jiggle Hook (Sinusoidal) ─────────────────────────
const useJiggle = (isEditing: boolean) => {
  const rotation = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  React.useEffect(() => {
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
  container: { minHeight: 44, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, marginBottom: 8 },
  colorBar: { width: 3, height: 20, borderRadius: 2, marginRight: 10 },
  name: { fontFamily: 'SpaceGrotesk-SemiBold', fontSize: 14, color: '#FFFFFF' },
  spacer: { flex: 1 },
  statusText: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 12, marginRight: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  chevron: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 18, color: 'rgba(255,255,255,0.2)' },
  deleteBadge: { position: 'absolute', top: -6, left: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#1E1E1E' },
  deleteIcon: { color: '#fff', fontSize: 14, fontWeight: 'bold', marginTop: -2 },
});

// ─── Reusable DepartureCard handles dynamic station arrivals and visual rendering

// ─── Section header ───────────────────────────────────────────────
const SectionHeader: React.FC<{ title: string; icon: React.ReactNode }> = ({ title, icon }) => (
  <View style={section.row}>
    {icon}
    <Text style={section.title}>{title}</Text>
  </View>
);
const section = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: 4 },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 11, letterSpacing: 0.1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' },
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

// ─── Main Dashboard ───────────────────────────────────────────────
const MyCommuteDashboard: React.FC = () => {
  const insets = useSafeAreaInsets();

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

  const { resetOnboarding, selectedLines, selectedStations, removeLine, removeStation, setLines, lastKnownData, setLastKnown } = useUserPreferencesStore(useShallow((s: any) => ({
    resetOnboarding: s.resetOnboarding,
    selectedLines: s.selectedLines || [],
    selectedStations: s.pinnedStations || [],
    removeLine: s.toggleLine,
    removeStation: s.unpinStation,
    setLines: s.reorderLines,
    lastKnownData: s.lastKnownData || [],
    setLastKnown: s.setLastKnown,
  })));

  const [modalVisible, setModalVisible] = useState(false);
  const [data, setData] = useState<DashboardData>({ lines: lastKnownData, stations: [] });
  const [isEditing, setIsEditing] = useState(false);

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
      const response = await fetch('https://my-commute-backend.vercel.app/api/lines', { signal });
      if (!response.ok) {
        return { status: response.status };
      }

      const raw = await response.json();

      const freshLines = raw.map((item: any) => ({
        id: String(item?.id ?? ''),
        name: String(item?.name ?? ''),
        color: TFL_COLORS[String(item?.id ?? '')] || '#888',
        status: String(item?.status ?? ''),
      }));

      // 2. Fetch live arrivals for each pinned station in parallel
      let freshStations: StationData[] = [];
      if (Array.isArray(selectedStations) && selectedStations.length > 0) {
        const stationPromises = selectedStations.map(async (st: any) => {
          try {
            const res = await fetch(`https://my-commute-backend.vercel.app/api/stations/${st.id}`, { signal });
            if (!res.ok) return null;
            const sData = await res.json();
            
            // Map arrivals
            const arrivals = (sData.departures || []).map((dep: any) => ({
              lineId: String(dep.line || '').toLowerCase().replace(' line', '').trim(),
              lineName: dep.line,
              lineColor: TFL_COLORS[String(dep.line || '').toLowerCase().replace(' line', '').replace(' & ', '-').replace(' ', '-').trim()] || '#888',
              minutesAway: dep.minutes_away,
              destination: String(dep.destination || '').replace(' Underground Station', '').replace(' DLR Station', ''),
              expectedArrival: dep.expected_arrival
            }));

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

  // ✅ The exact fix for the "onSave is undefined" bug
  const handleModalSave = useCallback((lines: string[], _stations: string[]) => {
    setLines(lines);
    setModalVisible(false);
  }, [setLines]);

  const networkSeverity = useMemo(() => worstSeverity(myLines), [myLines]);

  const SEVERITY_ORDER: Record<string, number> = { suspended: 0, severe: 1, minor: 2, good: 3, unknown: 4 };
  const sortedLines = [...myLines].sort((a, b) => {
    const sevA = parseSeverity(a.status);
    const sevB = parseSeverity(b.status);
    return (SEVERITY_ORDER[sevA] ?? 4) - (SEVERITY_ORDER[sevB] ?? 4);
  });

  return (
    <View style={dash.root}>
      <GradientBackground lines={selectedLines} status={networkSeverity as StatusLevel} />
      <Animated.View style={[{ flex: 1, paddingTop: insets.top }, revealStyle]}>
        {/* ── Global header ── */}
        <View style={dash.header}>
          <View style={dash.titleRow}>
            <NetworkHealthDot severity={networkSeverity} />
            <Text style={dash.titleMain}>MY</Text>
          </View>
          <View style={dash.titleSecondRow}>
            <Text style={dash.titleSub}>COMMUTE</Text>
            <View style={dash.headerActions}>
              {hasContent && (
                <Pressable onPress={handleEdit} style={dash.headerBtn} hitSlop={8}>
                  <Text style={dash.headerBtnText}>{isEditing ? 'Done' : 'Edit'}</Text>
                </Pressable>
              )}
              {/* ✅ + Button opens modal directly */}
              <Pressable onPress={() => setModalVisible(true)} style={[dash.headerBtn, dash.addBtn]} hitSlop={8}>
                <Text style={dash.addBtnText}>+</Text>
              </Pressable>
            </View>
          </View>
          <View style={dash.subheadingArea}>
            {networkSeverity !== 'good' && networkSeverity !== 'unknown' && (
              <Text style={dash.disruptedLinesText}>
                {sortedLines.filter(l => parseSeverity(l.status) !== 'good').map(l => l.name).join(', ')}
              </Text>
            )}
            <StaleStatusText staleState={staleState} staleMinutes={staleMinutes} />
          </View>
        </View>

        {/* ── Content ── */}
        <ScrollView
          style={dash.scroll}
          contentContainerStyle={[dash.scrollContent, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor="rgba(255,255,255,0.6)" />}
        >
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
              <SectionHeader title="MY LINES" icon={<Ionicons name="train-outline" size={13} color="rgba(255,255,255,0.35)" />} />
              {sortedLines.map((line) => (
                <LinePill key={line.id} line={line} isEditing={isEditing} onDelete={removeLine} onLongPress={handleEdit} />
              ))}
            </View>
          )}

          {selectedStations.length > 0 && (
            <View style={dash.section}>
              <SectionHeader title="MY STATIONS" icon={<Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.35)" />} />
              {selectedStations.map((station: any, index: number) => (
                <StaggeredCardWrapper key={station.id} index={index}>
                  <DepartureCard
                    stationId={station.id}
                    stationName={station.name}
                    role={station.role}
                    isEditing={isEditing}
                    onDelete={removeStation}
                    onLongPress={handleEdit}
                  />
                </StaggeredCardWrapper>
              ))}
            </View>
          )}
        </ScrollView>

        {/* ✅ Modal rendered HERE with all props correctly wired */}
        <AddManageModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          savedLines={selectedLines}
          savedStations={selectedStations}
          onSave={handleModalSave}
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  titleMain: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 28, color: '#FFFFFF', letterSpacing: -0.5, lineHeight: 32 },
  titleSecondRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleSub: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 28, color: '#FFFFFF', letterSpacing: -0.5, lineHeight: 32 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerBtn: { height: 32, paddingHorizontal: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  headerBtnText: { fontFamily: 'SpaceGrotesk-SemiBold', fontSize: 14, color: '#FFFFFF' },
  addBtn: { width: 32, paddingHorizontal: 0, backgroundColor: '#0098D4' },
  addBtnText: { fontFamily: 'SpaceGrotesk-Light', fontSize: 22, color: '#FFFFFF', lineHeight: 28 },
  subheadingArea: { marginTop: 4 },
  disruptedLinesText: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },
  staleText: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 12, color: '#64B5F6' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },
  section: { marginBottom: 24 },
  premiumEmptyState: { marginTop: 60, alignItems: 'center', paddingHorizontal: 16 },
  emptyVisual: { marginBottom: 32 },
  emptyTitle: { fontFamily: 'SpaceGrotesk-SemiBold', fontSize: 18, color: 'rgba(255,255,255,0.9)', textAlign: 'center', marginBottom: 32 },
  primaryBtn: { height: 56, width: '100%', borderRadius: 16, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  primaryBtnTxt: { fontSize: 16, fontFamily: 'SpaceGrotesk-Bold', color: '#0A0A0F' },
  ghostBtn: { height: 44, width: '100%', alignItems: 'center', justifyContent: 'center' },
  ghostBtnTxt: { fontSize: 16, fontFamily: 'SpaceGrotesk-SemiBold', color: 'rgba(255,255,255,0.6)' },
  promptScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  promptCard: { backgroundColor: '#141424', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 24, width: '100%', maxWidth: 340, alignItems: 'center' },
  promptIcon: { marginBottom: 16 },
  promptTitle: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 20, color: '#FFFFFF', textAlign: 'center', marginBottom: 12 },
  promptText: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 14, color: 'rgba(255,255,255,0.6)', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  promptActions: { width: '100%', gap: 12 },
  promptBtn: { height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', width: '100%' },
  promptBtnPrimary: { backgroundColor: '#FFFFFF' },
  promptBtnTextPrimary: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 15, color: '#0A0A0F' },
  promptBtnTextSecondary: { fontFamily: 'SpaceGrotesk-SemiBold', fontSize: 14, color: 'rgba(255,255,255,0.5)' },
});

export default MyCommuteDashboard;