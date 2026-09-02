/**
 * MyCommuteDashboard.tsx
 * ─────────────────────────────────────────────────────────────────
 * "Refined Transit Intelligence" — Bloomberg Terminal × Apple Maps
 * ─────────────────────────────────────────────────────────────────
 */

import React, { useCallback, useEffect, useState, useMemo, memo, useRef } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  UIManager,
  View,
  RefreshControl,
  BackHandler,
} from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { PREMIUM_BUTTON } from '../theme/colors';

// ✅ Wired directly to our Zustand + MMKV Brain
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { useShallow } from 'zustand/react/shallow';
import { useTflPoller } from '../hooks/useTflPoller';
import { useWorstStatus, computeWorstStatus } from '../hooks/useWorstStatus';
import { Ionicons } from '@expo/vector-icons';
// ✅ Modal now managed HERE, not upstream
import { ManageLinesModal } from './ManageLinesModal';
import { ManageStationsModal } from './ManageStationsModal';
import { usePressAnimation } from '../hooks/usePressAnimation';
import { useJiggleDriver, useLiveReducedMotion } from '../hooks/useJiggle';
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
import { LINE_IDENTITY_COLORS } from '../constants/lineColors';
import { APP_CONFIG } from '../config/app.config';
import { getSeverityColor, getSeverityRank } from '../utils/getSeverityColor';
import RerouteScreen from './RerouteScreen';
import { useAutoDetectBranch } from '../hooks/useAutoDetectBranch';
import type { ResolvedBranch } from '../utils/resolveBranch';
import {
  resolveRerouteMode,
  buildRerouteLinks,
  normalizeLineId,
} from './rerouteHelpers';


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

// Branch destinations per line — expanded to support 2x2 grid for 4-branch lines.
// (Mirror of StationCard.LINE_TERMINALS; kept local because that map isn't exported.)
// Lines with 4 branches get a 2x2 grid in RerouteScreen; 2-branch lines keep the old flow.
const REROUTE_LINE_BRANCHES: Record<string, string[]> = {
  central: ['Epping', 'Hainault via Newbury Park', 'Ealing Broadway', 'West Ruislip'],
  northern: ['Edgware', 'High Barnet', 'Morden', 'Battersea'],
  piccadilly: ['Cockfosters', 'Arnos Grove', 'Uxbridge', 'Heathrow T5'],
  district: ['Richmond', 'Wimbledon', 'Ealing Broadway', 'Upminster'],
  metropolitan: ['Amersham', 'Watford', 'Uxbridge', 'Aldgate'],
  elizabeth: ['Reading', 'Heathrow T5', 'Shenfield', 'Abbey Wood'],
  victoria: ['Walthamstow Central', 'Brixton'],
  jubilee: ['Stanmore', 'Stratford'],
  bakerloo: ['Harrow & Wealdstone', 'Elephant & Castle'],
  circle: ['Hammersmith', 'Edgware Road'],
  'hammersmith-city': ['Hammersmith', 'Barking'],
  'waterloo-city': ['Waterloo', 'Bank'],
  dlr: ['Bank', 'Lewisham', 'Beckton', 'Woolwich Arsenal'],
  overground: ['Liberty', 'Lioness', 'Mildmay', 'Suffragette', 'Weaver', 'Windrush'],
  weaver: ['Liverpool Street', 'Chingford', 'Cheshunt', 'Enfield Town'],
  mildmay: ['Stratford', 'Richmond', 'Clapham Junction'],
  windrush: ['Highbury & Islington', 'Crystal Palace', 'West Croydon', 'New Cross'],
  suffragette: ['Gospel Oak', 'Barking Riverside'],
  lioness: ['Watford Junction', 'Euston'],
  liberty: ['Romford', 'Upminster'],
};

const REROUTE_SUGGESTIONS: Record<string, { description: string; extraTimeMinutes: number }> = {
  central: {
    description: 'Use Elizabeth line or London Overground for parallel east-west connections.',
    extraTimeMinutes: 8,
  },
  metropolitan: {
    description: 'Use Jubilee line or Chiltern Railways from Finchley Road / Baker Street.',
    extraTimeMinutes: 10,
  },
  piccadilly: {
    description: 'Use District line via Hammersmith or Elizabeth line to Heathrow terminals.',
    extraTimeMinutes: 6,
  },
  district: {
    description: 'Use Piccadilly or Circle line via South Kensington / Victoria.',
    extraTimeMinutes: 5,
  },
  bakerloo: {
    description: 'Use Jubilee or Lioness lines via Willesden Junction / Baker Street.',
    extraTimeMinutes: 7,
  },
  northern: {
    description: 'Take Bank branch to Euston\nCross-platform to Charing Cross branch.',
    extraTimeMinutes: 7,
  },
  victoria: {
    description: 'Use Northern or Jubilee lines via Warren Street / Green Park.',
    extraTimeMinutes: 6,
  },
  jubilee: {
    description: 'Use Metropolitan or Central line via Finchley Road / Stratford.',
    extraTimeMinutes: 8,
  },
  elizabeth: {
    description: 'Use Central line or National Rail services for parallel travel.',
    extraTimeMinutes: 9,
  },
  circle: {
    description: 'Use District, Hammersmith & City, or Metropolitan lines.',
    extraTimeMinutes: 4,
  },
  'hammersmith-city': {
    description: 'Use Circle, Metropolitan, or District lines.',
    extraTimeMinutes: 4,
  },
  'waterloo-city': {
    description: 'Use Northern line via Bank / Waterloo or London Buses across the river.',
    extraTimeMinutes: 5,
  },
  dlr: {
    description: 'Use Jubilee line or Thames Clippers / London Buses across East London.',
    extraTimeMinutes: 7,
  },
  overground: {
    description: 'Use Underground lines or London Buses connecting your route.',
    extraTimeMinutes: 8,
  },
};



// ─── Severity mapping ─────────────────────────────────────────────
// Code→label mapping is delegated to the single source of truth in
// utils/getSeverityColor.ts (AGENTS.md §0). Only the dashboard's own
// network-state detection (offline/loading/unknown text) stays local —
// those states are NOT TfL statuses and getSeverityColor deliberately
// defaults unrecognized input to 'good'.
function getDashboardSeverity(statusText: string, statusSeverity?: number): Severity {
  const text = String(statusText ?? '').toLowerCase();
  if (text.includes('offline') || text.includes('connection') || text.includes('loading') || text.includes('unknown')) {
    return 'unknown';
  }
  return getSeverityColor(statusSeverity, statusText).label;
}

// ─── Smart Heartbeat Dot ─────────────────────────────────────────
const NetworkHealthDot = memo(({ severity }: { severity: Severity }) => {
  const opacity = useSharedValue(0.8);
  const reducedMotion = useLiveReducedMotion();

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
const SectionHeader: React.FC<{
  title: string;
  icon: React.ReactNode;
  onPressAdd?: () => void;
  isEditing: boolean;
  onExitJiggle?: () => void;
  onPressIn?: () => void;
}> = ({ title, icon, onPressAdd, isEditing, onExitJiggle, onPressIn }) => (
  <Pressable
    style={section.row}
    unstable_pressDelay={Platform.OS === 'ios' ? 70 : 90}
    onPressIn={onPressIn}
    onPress={isEditing ? onExitJiggle : undefined}
    accessibilityRole={isEditing ? 'button' : undefined}
    accessibilityLabel={isEditing ? `Exit editing ${title}` : undefined}
  >
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
      {icon}
      <Text style={section.title}>{title}</Text>
    </View>
    {onPressAdd && !isEditing && (
      <BouncyPressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
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
  </Pressable>
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
    shadowColor: PREMIUM_BUTTON.shadowColor,
    shadowOffset: PREMIUM_BUTTON.shadowOffset,
    shadowOpacity: PREMIUM_BUTTON.shadowOpacity,
    shadowRadius: PREMIUM_BUTTON.shadowRadius,
    elevation: PREMIUM_BUTTON.elevation,
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
  const reducedMotion = useLiveReducedMotion();
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
  const searchParams = useLocalSearchParams<{ openRerouteLineId?: string }>();
  const [modalVisible, setModalVisible] = useState(false);
  const [stationModalVisible, setStationModalVisible] = useState(false);
  const [data, setData] = useState<DashboardData>({ lines: lastKnownData });
  const [rerouteLine, setRerouteLine] = useState<LineData | null>(null);

  // Auto-open reroute drawer when navigated from a disruption notification
  useEffect(() => {
    if (searchParams.openRerouteLineId) {
      const targetId = String(searchParams.openRerouteLineId).toLowerCase();
      const matched = data.lines.find(l => l.id.toLowerCase() === targetId);
      if (matched) {
        setRerouteLine(matched);
      } else {
        const name = targetId.charAt(0).toUpperCase() + targetId.slice(1);
        setRerouteLine({
          id: targetId,
          name: `${name} line`,
          color: LINE_IDENTITY_COLORS[targetId] || '#0098D4',
          status: 'Severe Delays',
          status_severity: 6,
          reason: 'Disruption reported on line.',
        });
      }
    }
  }, [searchParams.openRerouteLineId, data.lines]);

  const [isEditing, setIsEditing] = useState(false);
  const [isDraggingLine, setIsDraggingLine] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const jiggle = useJiggleDriver(isEditing);

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

  const [selectedLineInfo, setSelectedLineInfo] = useState<{ id: string; anchorRect: any } | null>(null);
  const selectedLineForModal = useMemo(() => data.lines.find(l => l.id === selectedLineInfo?.id) || null, [data.lines, selectedLineInfo]);

  // ── Reroute state ── (declared above)



  // ✅ Permissions: the dashboard is a ZERO permission-ask surface per the
  // remediation plan Phase 4 (#2) — no session-count triggers, no auto
  // prompts. All permission asks route through store/permissionOrchestrator
  // from their feature triggers (onboarding, settings, Tier 1 upgrade).

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
        color: LINE_IDENTITY_COLORS[String(item?.id ?? '')] || '#888',
        status: String(item?.status ?? ''),
        status_severity: item?.status_severity ?? 10,
        reason: String(item?.reason ?? ''),
      }));

      // Aggregate Overground branches into a single virtual 'overground' line
      const OVERGROUND_BRANCH_IDS = ['liberty', 'lioness', 'mildmay', 'suffragette', 'weaver', 'windrush'];
      let worstBranch: any = null;
      let worstSeverityRank = -1;

      let foundAny = false;
      OVERGROUND_BRANCH_IDS.forEach(branchId => {
        const branchData = freshLines.find((l: any) => l.id === branchId);
        if (branchData) {
          foundAny = true;
          // Canonical severity rank — single source of truth (was a local
          // getRank copy that could silently diverge from utils/getSeverityColor).
          const rank = getSeverityRank(branchData.status_severity, branchData.status);
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
          color: LINE_IDENTITY_COLORS.overground || '#EE7C0E',
          status: worstBranch.status,
          status_severity: worstBranch.status_severity,
          reason: worstBranch.reason,
        });
      } else {
        freshLines.push({
          id: 'overground',
          name: 'London Overground',
          color: LINE_IDENTITY_COLORS.overground || '#EE7C0E',
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
          color: LINE_IDENTITY_COLORS[id] || '#888',
          status: staleState === 'offline'
            ? 'Offline'
            : (staleState === 'tfl-error' ? 'Connection error' : 'Loading status...'),
          status_severity: staleState ? 0 : 10,
        };
      });
  }, [data.lines, selectedLines, staleState]);

  const hasContent = myLines.length > 0 || selectedStations.length > 0;

  const onRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await forceRefresh();
  }, [forceRefresh]);

  const touchStartedInEditModeRef = useRef(false);

  const handleEdit = useCallback(() => {
    setIsEditing((prev) => {
      const next = !prev;
      if (prev) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      } else {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        setTimeout(() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        }, 80);
      }
      return next;
    });
  }, []);

  const handleBackgroundPressIn = useCallback(() => {
    touchStartedInEditModeRef.current = isEditing;
  }, [isEditing]);

  // Android hardware back button exits edit mode seamlessly
  useEffect(() => {
    if (!isEditing) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setIsEditing(false);
      return true;
    });
    return () => sub.remove();
  }, [isEditing]);

  // ── Backdrop tap exits jiggle ─────────────────────────────────
  const handleBackdropPress = useCallback(() => {
    // Only exit edit mode if this touch STARTED while already in edit mode (i.e. an intentional subsequent single tap)
    if (!touchStartedInEditModeRef.current) {
      return;
    }
    if (isEditing) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setIsEditing(false);
    }
  }, [isEditing]);

  // Tab switch automatically exits jiggle mode
  useFocusEffect(
    useCallback(() => {
      return () => {
        setIsEditing(false);
      };
    }, [])
  );

  const sortedLines = myLines;

  const itemRefs = useRef<Record<string, View>>({});

  const renderLineItem = useCallback(({ item, drag, isActive, getIndex }: RenderItemParams<LineData>) => {
    const idx = getIndex() ?? sortedLines.findIndex((l: LineData) => l.id === item.id);
    const severity = getDashboardSeverity(item.status, item.status_severity);

    const handlePress = () => {
      if (isEditing) return;
      const ref = itemRefs.current[item.id];
      if (ref) {
        ref.measureInWindow((x, y, width, height) => {
          setSelectedLineInfo({ id: item.id, anchorRect: { x, y, width, height } });
        });
      }
    };

    return (
      <ScaleDecorator activeScale={1.04}>
        <View
          ref={el => { if (el) itemRefs.current[item.id] = el; }}
          style={{ height: 46, marginBottom: 12 }}
        >
          <LineCard
            line={item}
            selected={false}
            onPress={handlePress}
            statusType={severity}
            statusLabel={item.status || 'Good service'}
            cardHeight={46}
            mode="display"
            isEditing={isEditing && !isDraggingLine}
            onDelete={removeLine}
            drag={isEditing ? drag : undefined}
            isActive={isActive}
            index={idx}
            jiggle={jiggle}
          />
        </View>
      </ScaleDecorator>
    );
  }, [isEditing, isDraggingLine, sortedLines, removeLine, jiggle]);
  const worstStatus = useWorstStatus(selectedLines);
  const networkSeverity = useMemo(() => {
    if (staleState === 'offline') return 'offline';
    return worstStatus as Severity;
  }, [staleState, worstStatus]);

  return (
    <View style={dash.root}>
      <DashboardGradient severity={networkSeverity} />
      <View style={{ flex: 1, paddingTop: insets.top }}>
        {/* ── Content ── */}
        <NestableScrollContainer
          ref={scrollRef}
          style={[dash.scroll, { zIndex: 1 }]}
          contentContainerStyle={[dash.scrollContent, { paddingBottom: insets.bottom + 80, flexGrow: 1 }]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={scrollEnabled}
          bounces={true}
          alwaysBounceVertical={true}
          overScrollMode="always"
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={false}
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
          {/* ── Background Touch Layer: Long-press to jiggle, tap to dismiss ── */}
          <Pressable
            style={StyleSheet.absoluteFillObject}
            unstable_pressDelay={Platform.OS === 'ios' ? 70 : 90}
            delayLongPress={700}
            onPressIn={handleBackgroundPressIn}
            onLongPress={!isEditing ? handleEdit : undefined}
            onPress={isEditing ? handleBackdropPress : undefined}
            testID="dashboard-background-pressable"
          />

          {/* ── Global header ── */}
          <View style={[dash.header, { paddingHorizontal: 4 }]}>
            <View style={dash.titleRow}>
              <Text style={dash.titleMain}>My Commute</Text>
              <View style={dash.headerActions}>
                {hasContent && (
                  <BouncyPressable
                    onPress={handleEdit}
                    style={[dash.headerBtn, isEditing && dash.headerBtnDone]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel={isEditing ? 'Finish editing layout' : 'Edit layout'}
                    accessibilityRole="button"
                  >
                    <Text style={[dash.headerBtnText, isEditing && dash.headerBtnTextDone]}>
                      {isEditing ? 'Done' : 'Edit'}
                    </Text>
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
                    onPressIn={handleBackgroundPressIn}
                    onExitJiggle={handleBackdropPress}
                  />
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
                    onPlaceholderIndexChange={() => {
                      Haptics.selectionAsync().catch(() => {});
                    }}
                    activationDistance={10}
                    autoscrollThreshold={80}
                    autoscrollSpeed={120}
                    dragHitSlop={{ top: 0, bottom: 0, left: 0, right: 0 }}
                    simultaneousHandlers={scrollRef}
                    scrollEnabled={false}
                    initialNumToRender={10}
                    windowSize={11}
                    maxToRenderPerBatch={10}
                    updateCellsBatchingPeriod={50}
                  />
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
                          unstable_pressDelay={Platform.OS === 'ios' ? 70 : 90}
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
                          unstable_pressDelay={Platform.OS === 'ios' ? 70 : 90}
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

              {/* Spacer between sections — catches backdrop taps and long-presses */}
              <Pressable
                style={{ height: isEditing ? 24 : 12 }}
                unstable_pressDelay={Platform.OS === 'ios' ? 70 : 90}
                delayLongPress={700}
                onPressIn={handleBackgroundPressIn}
                onLongPress={!isEditing ? handleEdit : undefined}
                onPress={isEditing ? handleBackdropPress : undefined}
              />

              {(selectedStations.length > 0 || isEditing) && (
                <View style={dash.section}>
                  <SectionHeader
                    title="My stations"
                    icon={<Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.35)" />}
                    onPressAdd={() => setStationModalVisible(true)}
                    isEditing={isEditing}
                    onPressIn={handleBackgroundPressIn}
                    onExitJiggle={handleBackdropPress}
                  />
                  {selectedStations.length === 0 ? (
                    <BouncyPressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
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
                      onExitJiggle={handleBackdropPress}
                      onDelete={removeStation}
                      onScrollEnabledChange={setScrollEnabled}
                      onReorderStations={reorderStations}
                      simultaneousHandlers={scrollRef}
                      jiggle={jiggle}
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

          {/* Bottom spacer — catches backdrop taps and long-presses */}
          <Pressable
            style={{ flex: 1, minHeight: 180 }}
            unstable_pressDelay={Platform.OS === 'ios' ? 70 : 90}
            delayLongPress={700}
            onPressIn={handleBackgroundPressIn}
            onLongPress={!isEditing ? handleEdit : undefined}
            onPress={isEditing ? handleBackdropPress : undefined}
          />
        </NestableScrollContainer>



        <ManageLinesModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
        />

        <ManageStationsModal
          visible={stationModalVisible}
          onClose={() => setStationModalVisible(false)}
        />

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
            statusType={getDashboardSeverity(selectedLineForModal.status, selectedLineForModal.status_severity)}
            statusLabel={selectedLineForModal.status}
            anchorRect={selectedLineInfo.anchorRect}
            stationId={
              selectedStations.find((st: any) =>
                Array.isArray(st.lines)
                  ? st.lines.some((l: string) => normalizeLineId(l) === normalizeLineId(selectedLineForModal.id))
                  : false
              )?.id || selectedStations[0]?.id || undefined
            }
            onOpenReroute={() => setRerouteLine(selectedLineForModal)}
          />
        )}

        {/* Reroute Screen — full-screen slide-up with the inline direction grid.
            RerouteContainer computes branches/statuses/mode/links AND runs the
            direction engine (useAutoDetectBranch), passing the resolved branch,
            source, and confidence through so the grid can pre-highlight. */}
        {rerouteLine && (
          <RerouteContainer
            rerouteLine={rerouteLine}
            selectedStations={selectedStations}
            onClose={() => setRerouteLine(null)}
          />
        )}
      </View>
    </View>
  );
};

// ─── Reroute Container ─────────────────────────────────────────────
// Owns all reroute data computation (extracted from the old inline IIFE in the
// dashboard JSX) and runs useAutoDetectBranch so RerouteScreen receives real
// resolved-terminus / source / confidence data for the pre-highlighted inline
// direction grid. Rendered only while a reroute line is active.
interface RerouteContainerProps {
  rerouteLine: LineData;
  selectedStations: { id: string; name: string; lines?: string[]; role?: string }[];
  onClose: () => void;
}

function RerouteContainer({ rerouteLine, selectedStations, onClose }: RerouteContainerProps) {
  // Station the reroute is scoped to: pinned station on line -> home/work -> first pinned -> empty fallback
  const scopedStation =
    selectedStations.find((st) =>
      Array.isArray(st.lines) ? st.lines.includes(rerouteLine.id) : false
    ) ||
    selectedStations.find((st) => st.role === 'home' || st.role === 'work') ||
    selectedStations[0];
  const stationId = scopedStation?.id || '';
  const stationName = scopedStation?.name;

  // Direction engine — session → notification → history → pinned/manual.
  // Drives the pre-highlighted grid tile + source caption in RerouteScreen.
  const { result } = useAutoDetectBranch(rerouteLine.id, stationId || undefined, stationName);

  // Expanded branch data supporting up to 4 destinations per line (2x2 grid).
  const branches = REROUTE_LINE_BRANCHES[rerouteLine.id] || [];
  const defaultTerminus = branches[0] || rerouteLine.name;
  const otherTerminus = branches[1] || '';

  // Engine-resolved terminus — only when fully resolved (not ambiguous).
  const engineBranch =
    result.branch && !('possibleBranches' in result.branch)
      ? (result.branch as ResolvedBranch)
      : null;
  // Fallback: the line's default terminus (branches[0]) — the same default
  // resolveRerouteMode treats as confirmedTerminus. The grid is ALWAYS
  // pre-highlighted (plan: no hidden auto-resolution, no "Change" step).
  const resolvedTerminus = engineBranch?.terminus ?? defaultTerminus;
  const resolvedSource = engineBranch ? result.source : 'manual';
  const resolvedConfidence = engineBranch ? result.confidence : 'low';

  // Per-branch status: parse disruption reason to mark which branches are affected.
  const reasonLower = (rerouteLine.reason || '').toLowerCase();
  const hasMentionedBranch = branches.some((branch: string) =>
    branch.toLowerCase().split(' ').some(word =>
      word.length > 3 && reasonLower.includes(word)
    )
  );
  const branchStatuses = branches.reduce((acc: any, branch: string) => {
    const isMentioned = branch.toLowerCase().split(' ').some(word =>
      word.length > 3 && reasonLower.includes(word)
    );
    acc[branch] =
      isMentioned || (!hasMentionedBranch && branch === defaultTerminus)
        ? 'affected'
        : 'unaffected';
    return acc;
  }, {} as Record<string, 'affected' | 'unaffected'>);

  const resolution = resolveRerouteMode({
    stationId,
    confirmedTerminus: defaultTerminus,
    otherTerminus,
    expectedLineId: rerouteLine.id,
    fallbackStatusType: getDashboardSeverity(rerouteLine.status, rerouteLine.status_severity),
    fallbackReason: rerouteLine.reason || rerouteLine.status,
  });
  const links = buildRerouteLinks(defaultTerminus);

  return (
    <RerouteScreen
      visible
      onClose={onClose}
      branches={branches}
      branchStatuses={branchStatuses}
      mode={resolution.mode}
      lineId={rerouteLine.id}
      lineName={rerouteLine.name}
      lineColor={rerouteLine.color}
      otherBranchName={otherTerminus}
      suggestedRoute={
        resolution.mode === 'affected'
          ? (REROUTE_SUGGESTIONS[rerouteLine.id] || {
              description: 'Use parallel London Bus routes or interchange via nearest operating line.',
              extraTimeMinutes: 8,
            })
          : undefined
      }
      googleMapsUrl={links.googleMapsUrl}
      citymapperUrl={links.citymapperUrl}
      stationId={stationId}
      severity={rerouteLine.status_severity}
      resolvedTerminus={resolvedTerminus}
      resolvedSource={resolvedSource}
      resolvedConfidence={resolvedConfidence}
    />
  );
}

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
    shadowColor: PREMIUM_BUTTON.shadowColor,
    shadowOffset: PREMIUM_BUTTON.shadowOffset,
    shadowOpacity: PREMIUM_BUTTON.shadowOpacity,
    shadowRadius: PREMIUM_BUTTON.shadowRadius,
    elevation: PREMIUM_BUTTON.elevation,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnDone: {
    backgroundColor: '#007AFF',
    borderColor: 'rgba(255, 255, 255, 0.40)',
    shadowColor: '#007AFF',
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  headerBtnText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 12,
    color: 'rgba(255,255,255,0.80)'
  },
  headerBtnTextDone: {
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#FFFFFF',
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