/**
 * MyCommuteDashboard.tsx
 * ─────────────────────────────────────────────────────────────────
 * "Refined Transit Intelligence" — Bloomberg Terminal × Apple Maps
 * ─────────────────────────────────────────────────────────────────
 */

import React, { useCallback, useEffect, useState, useMemo, memo, useRef } from 'react';
import {
  Platform,
  Pressable,
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
  withSpring
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { PREMIUM_BUTTON } from '../theme/colors';

// ✅ Wired directly to our Zustand + MMKV Brain
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { useShallow } from 'zustand/react/shallow';
import { useTflPoller } from '../hooks/useTflPoller';
import { useWorstStatus, computeWorstStatus } from '../hooks/useWorstStatus';
import { Ionicons } from '@expo/vector-icons';
import { useDeferredPermissionTriggers } from '../hooks/useDeferredPermissionTriggers';
// ✅ Modal now managed HERE, not upstream
import { ManageLinesModal } from './ManageLinesModal';
import { ManageStationsModal } from './ManageStationsModal';
import { usePressAnimation } from '../hooks/usePressAnimation';
import { DashboardGradient } from './DashboardGradient';
import { LineCard } from './LineCard'; // memoized
import { NestableScrollContainer, NestableDraggableFlatList, RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import DashboardGrid from './DashboardGrid';
import { LineDetailModal } from './LineDetailModal';
import { ConfirmationCard } from './ConfirmationCard';
import { DashboardSkeleton } from './DashboardSkeleton';
import LivingDot from './LivingDot';
import BouncyPressable from './BouncyPressable';
import { useLineDataStore } from '../store/lineDataStore';
import { JIGGLE_DEG, JIGGLE_MS } from '../hooks/useJiggle';
import { LINE_COLORS } from '../constants/lineColors';
import { APP_CONFIG } from '../config/app.config';
import RerouteSheet from './RerouteSheet';
import * as Linking from 'expo-linking';


if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ─── Types ────────────────────────────────────────────────────────
export type Severity = 'severe' | 'minor' | 'good' | 'offline' | 'suspended' | 'unknown';

interface LineData {
  id: string;
  name: string;
  color: string;
  status: string;
  reason?: string;
  status_severity?: number;
}

interface DashboardData {
  lines: LineData[];
}



// ─── Severity mapping ─────────────────────────────────────────────
// Maps RAW TfL status_severity codes to our Severity enum.
// Must stay aligned with useWorstStatus.ts severityToLevel() and AGENTS.md §1.
//
// TfL codes (raw):
//   10,18,14 → good     (Good Service / Special Service / Information)
//   5         → minor    (Minor Delays)
//   9,6,7,4,3 → severe  (Severe Delays / Part Suspended / Planned Closure)
//   0,11,8,16,17,19,1,2 → suspended (Suspended / Not Running / Bus Service / Service Closed)
//   20        → unknown  (Unknown)
function getSeverityFromStatus(statusText: string, statusSeverity?: number): Severity {
  if (statusSeverity !== undefined) {
    if (statusSeverity === 10 || statusSeverity === 18 || statusSeverity === 14) return 'good';
    if (statusSeverity === 5) return 'minor';
    if (statusSeverity === 9 || statusSeverity === 6 || statusSeverity === 7 || statusSeverity === 4 || statusSeverity === 3) return 'severe';
    if (statusSeverity === 0 || statusSeverity === 11 || statusSeverity === 8 || statusSeverity === 16 || statusSeverity === 17 || statusSeverity === 19 || statusSeverity === 1 || statusSeverity === 2) return 'suspended';
    if (statusSeverity === 20) return 'unknown';
  }
  // Fallback: parse status text when severity code is missing or unrecognized
  const text = String(statusText ?? '').toLowerCase();
  if (text.includes('good') && !text.includes('delay')) return 'good';
  if (text.includes('closure')) return 'suspended';
  if (text.includes('suspended')) return 'suspended';
  if (text.includes('bus')) return 'suspended';
  if (text.includes('not running')) return 'suspended';
  if (text.includes('closed')) return 'suspended';
  if (text.includes('severe')) return 'severe';
  if (text.includes('minor')) return 'minor';
  if (text.includes('delay')) return 'severe';
  if (text.includes('information')) return 'good';
  if (text.includes('reduced')) return 'minor';
  if (text.includes('offline') || text.includes('connection') || text.includes('loading') || text.includes('unknown')) return 'unknown';
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


// ─── Reusable DepartureCard handles dynamic station arrivals and visual rendering

// ─── Reusable DepartureCard handles dynamic station arrivals and visual rendering

// ─── Section header ───────────────────────────────────────────────
const SectionHeader: React.FC<{ title: string; icon: React.ReactNode; onPressAdd?: () => void; isEditing: boolean }> = ({ title, icon, onPressAdd, isEditing }) => (
  <View style={section.row}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
      {icon}
      <Text style={section.title}>{title}</Text>
    </View>
    {onPressAdd && !isEditing && (
      <BouncyPressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onPressAdd();
        }}
        style={section.addBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel={`Add ${title}`}
        accessibilityRole="button"
      >
        <Text style={section.addBtnText}>+</Text>
      </BouncyPressable>
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


// ─── Main Dashboard ───────────────────────────────────────────────
const MyCommuteDashboard: React.FC = () => {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<any>(null);

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

  const { resetOnboarding, selectedLines, selectedStations, removeLine, removeStation, reorderStations, reorderLines, lastKnownData, setLastKnown, labelsConfirmed, hasSeenConfirmationCard, completedJourneys, arrivalNotificationsEnabled, arrivalSnoozeExpiry, setArrivalNotificationsEnabled, setArrivalSnoozeExpiry } = useUserPreferencesStore(useShallow((s: any) => ({
    resetOnboarding: s.resetOnboarding,
    selectedLines: s.selectedLines || [],
    selectedStations: s.pinnedStations || [],
    removeLine: s.toggleLine,
    removeStation: s.unpinStation,
    reorderStations: s.reorderStations,
    reorderLines: s.reorderLines,
    lastKnownData: s.lastKnownData || [],
    setLastKnown: s.setLastKnown,
    labelsConfirmed: s.labelsConfirmed ?? false,
    hasSeenConfirmationCard: s.hasSeenConfirmationCard ?? false,
    completedJourneys: s.completedJourneys ?? 0,
    arrivalNotificationsEnabled: s.arrivalNotificationsEnabled ?? true,
    arrivalSnoozeExpiry: s.arrivalSnoozeExpiry ?? null,
    setArrivalNotificationsEnabled: s.setArrivalNotificationsEnabled,
    setArrivalSnoozeExpiry: s.setArrivalSnoozeExpiry,
  })));

  const notificationsOffPress = usePressAnimation('departure_card');
  const snoozedPress = usePressAnimation('departure_card');

  const router = useRouter();
  const [modalVisible, setModalVisible] = useState(false);
  const [stationModalVisible, setStationModalVisible] = useState(false);
  const [data, setData] = useState<DashboardData>({ lines: lastKnownData });
  const [isEditing, setIsEditing] = useState(false);
  const [isDraggingLine, setIsDraggingLine] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const globalJiggle = useSharedValue(0);

  const isScrollingRef = useRef(false);
  const pendingDataRef = useRef<DashboardData | null>(null);
  const hasCompletedFirstEntrance = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      hasCompletedFirstEntrance.current = true;
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  const applyPendingData = useCallback(() => {
    isScrollingRef.current = false;
    if (pendingDataRef.current) {
      setData(pendingDataRef.current);
      pendingDataRef.current = null;
      console.log('[MyCommuteDashboard] Applied deferred scroll data update');
    }
  }, []);

  useEffect(() => {
    if (isEditing && !reducedMotion) {
      globalJiggle.value = withRepeat(
        withSequence(
          withTiming(-JIGGLE_DEG, { duration: JIGGLE_MS, easing: Easing.inOut(Easing.sin) }),
          withTiming(JIGGLE_DEG, { duration: JIGGLE_MS, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        false
      );
    } else {
      cancelAnimation(globalJiggle);
      globalJiggle.value = withTiming(0, { duration: 150 });
    }
  }, [isEditing, globalJiggle, reducedMotion]);

  const [selectedLineInfo, setSelectedLineInfo] = useState<{ id: string; anchorRect: any } | null>(null);
  const selectedLineForModal = useMemo(() => data.lines.find(l => l.id === selectedLineInfo?.id) || null, [data.lines, selectedLineInfo]);

  // ── Reroute state ──
  const [rerouteLine, setRerouteLine] = useState<LineData | null>(null);



  // ✅ Deferred Permission Trigger System (Phase 6)
  const {
    shouldShowNotificationPrompt,
    shouldShowCalendarPrompt,
    requestCalendarPermission,
    requestNotificationPermission,
  } = useDeferredPermissionTriggers();

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

      // Aggregate Overground branches into a single virtual 'overground' line
      const OVERGROUND_BRANCH_IDS = ['liberty', 'lioness', 'mildmay', 'suffragette', 'weaver', 'windrush'];
      let worstBranch: any = null;
      let worstSeverityRank = -1;

      const getRank = (s: number) => {
        if (s === 10 || s === 18 || s === 14) return 0;                    // good
        if (s === 5) return 1;                                             // minor
        if (s === 9 || s === 6 || s === 7 || s === 4 || s === 3) return 2; // severe
        if (s === 0 || s === 11 || s === 8 || s === 16 || s === 17 || s === 19 || s === 1 || s === 2) return 3; // suspended
        return 4;                                                          // 20 → unknown
      };

      let foundAny = false;
      OVERGROUND_BRANCH_IDS.forEach(branchId => {
        const branchData = freshLines.find((l: any) => l.id === branchId);
        if (branchData) {
          foundAny = true;
          const rank = getRank(branchData.status_severity ?? 10);
          if (rank > worstSeverityRank) {
            worstSeverityRank = rank;
            worstBranch = branchData;
          }
        }
      });

      if (foundAny && worstBranch) {
        freshLines.push({
          id: 'overground',
          name: 'London Overground',
          color: LINE_COLORS.overground || '#EE7C0E',
          status: worstBranch.status,
          status_severity: worstBranch.status_severity,
          reason: worstBranch.reason,
        });
      } else {
        freshLines.push({
          id: 'overground',
          name: 'London Overground',
          color: LINE_COLORS.overground || '#EE7C0E',
          status: 'Good service',
          status_severity: 10,
          reason: '',
        });
      }

      // Populate global line status store so StationDetailScreen reads live severity
      useLineDataStore.getState().setLines(freshLines);

      const fresh: DashboardData = {
        lines: freshLines,
      };

      if (isScrollingRef.current) {
        pendingDataRef.current = fresh;
      } else {
        setData(fresh);
      }

      const linesMap = useLineDataStore.getState().lines;
      const communityReports = useLineDataStore.getState().communityReports;
      const worst = computeWorstStatus(selectedLines, linesMap, communityReports);
      setLastKnown(worst, freshLines);

      return { status: response.status, lastUpdated: raw[0]?.updated_at };
    } catch (err: any) {
      console.log('Fetch error');
      throw err;
    }
  }, [selectedLines, setLastKnown]);

  const { forceRefresh, isLoading, staleState, staleMinutes } = useTflPoller(fetchData, lastKnownData && lastKnownData.length > 0);

  const myLines = useMemo(() => {
    return selectedLines
      .map((id: string) => {
        const found = data.lines.find((l: LineData) => l.id === id);
        if (found) return found;
        return {
          id,
          name: id.charAt(0).toUpperCase() + id.slice(1).replace('-', ' '),
          color: LINE_COLORS[id] || '#888',
          status: staleState === 'offline' 
            ? 'Offline' 
            : (staleState === 'tfl-error' ? 'Connection error' : 'Loading status...'),
          status_severity: staleState ? 0 : 10,
        };
      });
  }, [data.lines, selectedLines, staleState]);

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

  const onRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await forceRefresh();
  }, [forceRefresh]);

  const handleEdit = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsEditing((v) => !v);
  }, []);

  // ── Backdrop tap exits jiggle ─────────────────────────────────
  const handleBackdropPress = useCallback(() => {
    if (isEditing) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setIsEditing(false);
    }
  }, [isEditing]);

  const sortedLines = myLines;

  const itemRefs = useRef<Record<string, View>>({});

  const renderLineItem = useCallback(({ item, drag, isActive, getIndex }: RenderItemParams<LineData>) => {
    const idx = getIndex() ?? sortedLines.findIndex((l: LineData) => l.id === item.id);
    const severity = getSeverityFromStatus(item.status, item.status_severity);

    const handlePress = () => {
      const ref = itemRefs.current[item.id];
      if (ref) {
        ref.measureInWindow((x, y, width, height) => {
          setSelectedLineInfo({ id: item.id, anchorRect: { x, y, width, height } });
        });
      }
    };

    const handleLongPress = () => {
      if (isEditing) {
        drag();
      } else {
        handleEdit();
      }
    };

    return (
      <ScaleDecorator>
        <View
          ref={el => { if (el) itemRefs.current[item.id] = el; }}
          style={{ height: 46, marginBottom: 12 }}
        >
          <LineCard
            line={item}
            selected={false}
            onPress={handlePress}
            onLongPress={handleLongPress}
            statusType={severity}
            statusLabel={item.status || 'Good service'}
            cardHeight={46}
            mode="display"
            isEditing={isEditing && !isDraggingLine}
            onDelete={removeLine}
            drag={isEditing ? drag : undefined}
            isActive={isActive}
            index={idx}
            globalJiggle={globalJiggle}
          />
        </View>
      </ScaleDecorator>
    );
  }, [isEditing, isDraggingLine, sortedLines, removeLine, handleEdit, globalJiggle]);
  const worstStatus = useWorstStatus(selectedLines);
  const networkSeverity = useMemo(() => {
    if (staleState === 'offline') return 'offline';
    return worstStatus as Severity;
  }, [staleState, worstStatus]);

  return (
    <View style={dash.root}>
      <DashboardGradient severity={networkSeverity} />
      <Animated.View style={[{ flex: 1, paddingTop: insets.top }, revealStyle]}>
        {/* ── Content ── */}
        <NestableScrollContainer
          ref={scrollRef}
          style={[dash.scroll, { zIndex: 1 }]}
          contentContainerStyle={[dash.scrollContent, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={scrollEnabled}
          removeClippedSubviews={true}
          onScrollBeginDrag={() => {
            isScrollingRef.current = true;
          }}
          onScrollEndDrag={applyPendingData}
          onMomentumScrollBegin={() => {
            isScrollingRef.current = true;
          }}
          onMomentumScrollEnd={applyPendingData}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor="rgba(255,255,255,0.6)" />}
        >
          {/* ── Global header ── */}
          <View style={[dash.header, { paddingHorizontal: 4 }]}>
            <View style={dash.titleRow}>
              <Text style={dash.titleMain}>My Commute</Text>
              <View style={dash.headerActions}>
                {hasContent && (
                  <BouncyPressable
                    onPress={handleEdit}
                    style={dash.headerBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel={isEditing ? 'Finish editing layout' : 'Edit layout'}
                    accessibilityRole="button"
                  >
                    <Text style={dash.headerBtnText}>{isEditing ? 'Done' : 'Edit'}</Text>
                  </BouncyPressable>
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

          {hasContent && isLoading && data.lines.length === 0 ? (
            <DashboardSkeleton />
          ) : (
            <>
              {sortedLines.length > 0 && (
                <View style={dash.section}>
                  <SectionHeader 
                    title="My lines" 
                    icon={<Ionicons name="train-outline" size={13} color="rgba(255,255,255,0.35)" />} 
                    onPressAdd={() => setModalVisible(true)}
                    isEditing={isEditing}
                  />
                  {isEditing ? (
                    <NestableDraggableFlatList
                      data={sortedLines}
                      keyExtractor={(item: LineData) => item.id}
                      renderItem={renderLineItem}
                      onDragBegin={() => {
                        setIsDraggingLine(true);
                        setScrollEnabled(false);
                      }}
                      onDragEnd={({ data }) => {
                        setIsDraggingLine(false);
                        setScrollEnabled(true);
                        reorderLines((data as LineData[]).map(l => l.id));
                      }}
                      activationDistance={8}
                      dragHitSlop={{ top: 0, bottom: 0, left: 0, right: 0 }}
                      simultaneousHandlers={scrollRef}
                      scrollEnabled={false}
                      initialNumToRender={10}
                      windowSize={11}
                      maxToRenderPerBatch={10}
                      updateCellsBatchingPeriod={50}
                    />
                  ) : (
                    <View>
                      {sortedLines.map((item: LineData, idx: number) => {
                        const severity = getSeverityFromStatus(item.status, item.status_severity);
                        const handlePress = () => {
                          if (isEditing) return;
                          const ref = itemRefs.current[item.id];
                          if (ref) {
                            ref.measureInWindow((x, y, width, height) => {
                              setSelectedLineInfo({ id: item.id, anchorRect: { x, y, width, height } });
                            });
                          }
                        };
                        const handleLongPress = () => {
                          if (isEditing) return;
                          handleEdit();
                        };
                        return (
                          <View
                            key={item.id}
                            ref={el => { if (el) itemRefs.current[item.id] = el; }}
                            style={{ height: 46, marginBottom: 12 }}
                          >
                            <LineCard
                              line={item}
                              selected={false}
                              onPress={handlePress}
                              onLongPress={handleLongPress}
                              statusType={severity}
                              statusLabel={item.status || 'Good service'}
                              cardHeight={46}
                              mode="display"
                              isEditing={false}
                              index={idx}
                              globalJiggle={globalJiggle}
                            />
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}

              {sortedLines.length > 0 && selectedStations.length > 0 && (
                <>
                  {/* Confirmation card — after first tracked commute, before confirmed */}
                  {selectedStations.length > 0 && completedJourneys > 0 && !labelsConfirmed && !hasSeenConfirmationCard && (
                    <View style={{ paddingHorizontal: 4, marginBottom: 12 }}>
                      <ConfirmationCard />
                    </View>
                  )}

                  {/* Arrival banner — only when confirmation card is NOT showing */}
                  {selectedStations.length > 0 && !(!labelsConfirmed && !hasSeenConfirmationCard && completedJourneys > 0) && (() => {
                    const isSnoozed = arrivalSnoozeExpiry && Date.now() < arrivalSnoozeExpiry;
                    if (arrivalNotificationsEnabled === false) {
                      return (
                        <AnimatedPressable
                          onPress={() => setArrivalNotificationsEnabled(true)}
                          onPressIn={notificationsOffPress.onPressIn}
                          onPressOut={notificationsOffPress.onPressOut}
                          style={[dash.arrivalBanner, notificationsOffPress.animatedStyle]}
                        >
                          <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFillObject} />
                          <Ionicons name="notifications-off-outline" size={16} color="#FFA500" />
                          <Text style={dash.arrivalBannerText}>
                            Arrival notifications are off — <Text style={{ fontWeight: '600' }}>turn back on</Text>
                          </Text>
                        </AnimatedPressable>
                      );
                    }
                    if (isSnoozed) {
                      const d = new Date(arrivalSnoozeExpiry!);
                      const hours = d.getHours();
                      const mins = d.getMinutes();
                      const ampm = hours >= 12 ? 'pm' : 'am';
                      const h12 = hours % 12 || 12;
                      const timeStr = `${h12}:${String(mins).padStart(2, '0')}${ampm}`;
                      return (
                        <AnimatedPressable
                          onPress={() => setArrivalSnoozeExpiry(null)}
                          onPressIn={snoozedPress.onPressIn}
                          onPressOut={snoozedPress.onPressOut}
                          style={[dash.arrivalBanner, snoozedPress.animatedStyle]}
                        >
                          <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFillObject} />
                          <Ionicons name="alarm-outline" size={16} color="#007AFF" />
                          <Text style={dash.arrivalBannerText}>
                            Arrival notifications snoozed until {timeStr} — <Text style={{ fontWeight: '600' }}>tap to resume</Text>
                          </Text>
                        </AnimatedPressable>
                      );
                    }
                    return null;
                  })()}
                </>
              )}

              {/* Spacer between sections — catches backdrop taps */}
              {isEditing && sortedLines.length > 0 && (
                <Pressable style={{ height: 24 }} onPress={handleBackdropPress} />
              )}

              {(selectedStations.length > 0 || isEditing) && (
                <View style={dash.section}>
                  <SectionHeader 
                    title="My stations" 
                    icon={<Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.35)" />} 
                    onPressAdd={() => setStationModalVisible(true)}
                    isEditing={isEditing}
                  />
                  {selectedStations.length === 0 ? (
                    <BouncyPressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                        setStationModalVisible(true);
                      }}
                      style={dash.addStationCard}
                      accessibilityLabel="Add your first station"
                      accessibilityRole="button"
                    >
                      <BlurView
                        intensity={20}
                        tint="dark"
                        style={[StyleSheet.absoluteFillObject, dash.addCardBlur]}
                      />
                      <Ionicons name="add" size={20} color="rgba(255,255,255,0.40)" style={dash.addCardIcon} />
                      <Text style={dash.addCardText}>Add your first station</Text>
                    </BouncyPressable>
                  ) : (
                    <DashboardGrid
                      stations={selectedStations}
                      isJiggling={isEditing}
                      onExitJiggle={() => setIsEditing(false)}
                      onDelete={removeStation}
                      onLongPressCard={() => setIsEditing(true)}
                      onScrollEnabledChange={setScrollEnabled}
                      onReorderStations={reorderStations}
                      simultaneousHandlers={scrollRef}
                      globalJiggle={globalJiggle}
                      skipEntrance={hasCompletedFirstEntrance.current}
                      onStationTap={(stationId, stationName) =>
                        router.push(
                          `/station-detail?stationId=${encodeURIComponent(stationId)}&stationName=${encodeURIComponent(stationName)}`
                        )
                      }
                    />
                  )}
                </View>
              )}
            </>
          )}

          {/* Bottom spacer — catches backdrop taps below all cards */}
          {isEditing && (
            <Pressable
              style={{ flex: 1, minHeight: 250 }}
              onPress={handleBackdropPress}
            />
          )}
        </NestableScrollContainer>

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
                <BouncyPressable
                  style={[dash.promptBtn, dash.promptBtnPrimary]}
                  onPress={async () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                    await requestNotificationPermission();
                    setShowNotifPrompt(false);
                  }}
                  accessibilityLabel="Notify me of line delays"
                  accessibilityRole="button"
                >
                  <Text style={dash.promptBtnTextPrimary}>Notify me</Text>
                </BouncyPressable>
                <BouncyPressable
                  style={dash.promptBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setShowNotifPrompt(false);
                  }}
                  accessibilityLabel="Maybe later"
                  accessibilityRole="button"
                >
                  <Text style={dash.promptBtnTextSecondary}>Maybe later</Text>
                </BouncyPressable>
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
                <BouncyPressable
                  style={[dash.promptBtn, dash.promptBtnPrimary]}
                  onPress={async () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                    await requestCalendarPermission();
                    setShowCalPrompt(false);
                  }}
                  accessibilityLabel="Allow Calendar Access"
                  accessibilityRole="button"
                >
                  <Text style={dash.promptBtnTextPrimary}>Allow Calendar Access</Text>
                </BouncyPressable>
                <BouncyPressable
                  style={dash.promptBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setShowCalPrompt(false);
                  }}
                  accessibilityLabel="Maybe later"
                  accessibilityRole="button"
                >
                  <Text style={dash.promptBtnTextSecondary}>Maybe later</Text>
                </BouncyPressable>
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
            statusType={getSeverityFromStatus(selectedLineForModal.status, selectedLineForModal.status_severity)}
            statusLabel={selectedLineForModal.status}
            anchorRect={selectedLineInfo.anchorRect}
            onOpenReroute={() => setRerouteLine(selectedLineForModal)}
          />
        )}

        {/* Reroute Sheet — full-screen slide-up for disruption alternatives */}
        <RerouteSheet
          visible={!!rerouteLine}
          onClose={() => setRerouteLine(null)}
          lineId={rerouteLine?.id ?? ''}
          lineName={rerouteLine?.name ?? ''}
          lineColor={rerouteLine?.color ?? '#666666'}
          branchName=""
          terminus=""
          disruptionReason={rerouteLine?.reason || rerouteLine?.status || 'Disruption reported'}
          isBranchAffected={true}
          affectedBranchOnly={false}
          onOpenGoogleMaps={() => {
            Linking.openURL('https://maps.google.com').catch(() => {});
            setRerouteLine(null);
          }}
          onOpenCitymapper={Linking.canOpenURL('citymapper://').then(() => () => {
            Linking.openURL('citymapper://').catch(() => {});
            setRerouteLine(null);
          }).catch(() => undefined) as any}
        />
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

  arrivalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 8,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  arrivalBannerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'SpaceGrotesk_500Medium',
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 18,
  },
});

export default MyCommuteDashboard;