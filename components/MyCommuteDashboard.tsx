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
  Pressable,
  AccessibilityInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useReduceTransparency } from '../hooks/useReduceTransparency';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  cancelAnimation,
  FadeInDown,
  FadeOutDown,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { PREMIUM_BUTTON, GLASS } from '../theme/colors';
import { deleteCachedArrivals } from '../services/stationArrivalsStore';
import { usePressAnimation } from '../hooks/usePressAnimation';

// ✅ Wired directly to our Zustand + MMKV Brain
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { useShallow } from 'zustand/react/shallow';
import { useTflPoller } from '../hooks/useTflPoller';
import { LiveActivityService } from '../services/LiveActivityService';
import { normaliseLineId } from '../utils/normaliseLineId';
import { tflCapitalise } from '../utils/tflCapitalise';
import { useWorstStatus, computeWorstStatus } from '../hooks/useWorstStatus';
import { Ionicons } from '@expo/vector-icons';
import { Gear } from 'phosphor-react-native';
// ✅ Modal now managed HERE, not upstream
import { ManageLinesModal } from './ManageLinesModal';
import { ManageStationsModal } from './ManageStationsModal';
import { useLiveReducedMotion } from '../hooks/useJiggle';
import { useScrollLock } from '../hooks/useScrollLock';
import { DashboardGradient } from './DashboardGradient';
import { LineCard } from './LineCard'; // memoized
import { AppleSwipeableRow } from './AppleSwipeableRow';
import { NestableScrollContainer, NestableDraggableFlatList, RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import DashboardGrid from './DashboardGrid';
import { ConfirmationCard } from './ConfirmationCard';
import { DashboardSkeleton } from './DashboardSkeleton';
import LivingDot from './LivingDot';
import BouncyPressable from './BouncyPressable';
import { useLineDataStore } from '../store/lineDataStore';
import { LINE_IDENTITY_COLORS } from '../constants/lineColors';
import { APP_CONFIG } from '../config/app.config';
import { pressFeedback } from '../utils/pressFeedback';
import { getSeverityColor, getSeverityRank } from '../utils/getSeverityColor';
import RerouteScreen from './RerouteScreen';
import { useAutoDetectBranch } from '../hooks/useAutoDetectBranch';
import type { ResolvedBranch } from '../utils/resolveBranch';
import {
  resolveRerouteMode,
  buildRerouteLinks,
  normalizeLineId,
  isBranchMentioned,
  isLineWideDisruption,
} from './rerouteHelpers';

let isNativeGlassAvailable = false;
try {
  if (Platform.OS === 'ios' && typeof isLiquidGlassAvailable === 'function') {
    isNativeGlassAvailable = isLiquidGlassAvailable();
  }
} catch {
  isNativeGlassAvailable = false;
}


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
export const REROUTE_LINE_BRANCHES: Record<string, string[]> = {
  central: [
    'Epping branch',
    'Hainault (via Newbury Park) branch',
    'Hainault (via Woodford) branch',
    'West Ruislip branch',
    'Ealing Broadway branch',
  ],
  northern: [
    'Bank branch',
    'Charing Cross branch',
    'Edgware branch',
    'High Barnet branch',
    'Mill Hill East branch',
    'Battersea Power Station branch',
  ],
  piccadilly: ['Heathrow branch', 'Uxbridge branch'],
  district: [
    'Upminster branch',
    'Wimbledon branch',
    'Richmond branch',
    'Ealing Broadway branch',
    'Edgware Road branch',
  ],
  metropolitan: [
    'Amersham branch',
    'Chesham branch',
    'Watford branch',
    'Uxbridge branch',
  ],
  elizabeth: [
    'Reading branch',
    'Heathrow branch',
    'Shenfield branch',
    'Abbey Wood branch',
  ],
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
}> = ({ title, icon, onPressAdd }) => (
  <View style={section.row}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
      {icon}
      <Text style={section.title}>{title}</Text>
    </View>
    {onPressAdd && (
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
    borderTopColor: PREMIUM_BUTTON.borderTopColor,
    borderBottomColor: PREMIUM_BUTTON.borderBottomColor,
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


// ─── Session-Level Intent Deduplication Sets ──────────────────────
// Survives React component unmount/remount cycles during tab switching
const sessionConsumedManageLinesNonces = new Set<string>();
const sessionConsumedNotificationNonces = new Set<string>();
const sessionConsumedLegacyLineIds = new Set<string>();

// ─── Main Dashboard ───────────────────────────────────────────────
const MyCommuteDashboard: React.FC = () => {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<any>(null);
  const reduceTransparency = useReduceTransparency();

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
  const searchParams = useLocalSearchParams<{
    openRerouteLineId?: string;
    notificationIntent?: string;
    notificationNonce?: string;
    manageLines?: string;
  }>();
  const [modalVisible, setModalVisible] = useState(false);
  const [stationModalVisible, setStationModalVisible] = useState(false);
  const [data, setData] = useState<DashboardData>({ lines: lastKnownData });
  const [rerouteLine, setRerouteLine] = useState<LineData | null>(null);
  const [rerouteInitialSection, setRerouteInitialSection] = useState<'overview' | 'alternatives'>('overview');
  const lastConsumedNonceRef = useRef<string | null>(null);
  const lastConsumedLegacyLineRef = useRef<string | null>(null);
  const lastConsumedManageLinesNonceRef = useRef<string | null>(null);

  // Auto-open manage lines modal or unified disruption briefing when navigated via deep link/intent
  useEffect(() => {
    // 1. Manage lines deep link / intent
    if (searchParams.manageLines) {
      const nonce = String(searchParams.manageLines);
      if (!sessionConsumedManageLinesNonces.has(nonce) && nonce !== lastConsumedManageLinesNonceRef.current) {
        sessionConsumedManageLinesNonces.add(nonce);
        lastConsumedManageLinesNonceRef.current = nonce;
        setModalVisible(true);
      }
      // Poka-Yoke: Immediately clear manageLines so tab switches or re-renders never resurrect the modal
      router.setParams({ manageLines: '' });
    }

    // 2. Guard against replay of already-consumed notification nonce or legacy line param
    if (searchParams.notificationNonce && (sessionConsumedNotificationNonces.has(String(searchParams.notificationNonce)) || searchParams.notificationNonce === lastConsumedNonceRef.current)) {
      router.setParams({ notificationIntent: '', notificationNonce: '' });
      return;
    }
    if (searchParams.openRerouteLineId && (sessionConsumedLegacyLineIds.has(String(searchParams.openRerouteLineId)) || searchParams.openRerouteLineId === lastConsumedLegacyLineRef.current)) {
      router.setParams({ openRerouteLineId: '' });
      return;
    }

    let targetLineId: string | null = null;
    let action: 'show-disruption' | 'show-reroute' = 'show-disruption';
    let initialSection: 'overview' | 'alternatives' = 'overview';

    if (searchParams.notificationIntent) {
      if (searchParams.notificationNonce) {
        sessionConsumedNotificationNonces.add(String(searchParams.notificationNonce));
        lastConsumedNonceRef.current = searchParams.notificationNonce;
      }
      try {
        const intent = JSON.parse(searchParams.notificationIntent);
        if (intent && (intent.action === 'show-disruption' || intent.action === 'show-reroute')) {
          targetLineId = String(intent.lineId).toLowerCase();
          action = intent.action;
          initialSection = intent.initialSection || (intent.action === 'show-reroute' ? 'alternatives' : 'overview');
        }
      } catch (err) {
        console.warn('[MyCommuteDashboard] Failed to parse notificationIntent:', err);
      }
    } else if (searchParams.openRerouteLineId) {
      // Backward compatibility with direct line param
      targetLineId = String(searchParams.openRerouteLineId).toLowerCase();
      action = 'show-reroute';
      sessionConsumedLegacyLineIds.add(String(searchParams.openRerouteLineId));
      lastConsumedLegacyLineRef.current = searchParams.openRerouteLineId;
    }

    if (targetLineId) {
      const matched = data.lines.find(l => l.id.toLowerCase() === targetLineId);
      const lineData: LineData = matched || {
        id: targetLineId,
        name: `${targetLineId.charAt(0).toUpperCase() + targetLineId.slice(1)} line`,
        color: LINE_IDENTITY_COLORS[targetLineId] || '#8E8E93',
        status: 'Severe Delays',
        status_severity: 6,
        reason: 'Disruption reported on line.',
      };

      if (action === 'show-reroute') {
        // Quick Action [View Reroute 🚇] from expanded banner
        setRerouteInitialSection(initialSection);
        setRerouteLine(lineData);
      } else {
        // Normal Tap on notification: Expand the line card inline showing disruption details
        setRerouteLine(null);
        setExpandedLineId(targetLineId);
      }

      // Consume-once: clear navigation params so re-renders or drawer dismissals don't resurrect
      router.setParams({
        notificationIntent: '',
        notificationNonce: '',
        openRerouteLineId: '',
      });
    }
  }, [searchParams.manageLines, searchParams.notificationIntent, searchParams.notificationNonce, searchParams.openRerouteLineId, data.lines, router]);

  const { scrollEnabled, setScrollEnabled } = useScrollLock();

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

  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);

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

      // Sync fresh line statuses & severities to WidgetKit AppGroup cache
      if (Platform.OS === 'ios' && selectedLines && selectedLines.length > 0) {
        const customStatuses = selectedLines.map((id: string) => {
          const norm = normaliseLineId(id).cleanLineId;
          const lineObj = freshLines.find((l: any) => l.id === id || l.id === norm);
          return {
            id,
            name: lineObj?.name || tflCapitalise(id),
            status: lineObj?.status || 'Good service',
            severity: lineObj?.status_severity ?? 10,
          };
        });
        void LiveActivityService.syncWidgetCache(selectedLines, customStatuses);
      }

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
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setIsPullRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await forceRefresh();
    } finally {
      setIsPullRefreshing(false);
    }
  }, [forceRefresh]);



  const [pendingDelete, setPendingDelete] = useState<{
    station: any;
    index: number;
  } | null>(null);
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDeleteStation = useCallback((stationId: string) => {
    if (deleteTimeoutRef.current) {
      clearTimeout(deleteTimeoutRef.current);
      deleteTimeoutRef.current = null;
    }
    if (pendingDelete) {
      deleteCachedArrivals(pendingDelete.station.id);
    }

    const currentStations = useUserPreferencesStore.getState().pinnedStations || [];
    const index = currentStations.findIndex((s: any) => s.id === stationId);
    const station = currentStations[index];

    removeStation(stationId);

    if (station) {
      setPendingDelete({ station, index });
      deleteTimeoutRef.current = setTimeout(() => {
        deleteCachedArrivals(stationId);
        setPendingDelete(null);
        deleteTimeoutRef.current = null;
      }, 4000);
    }
  }, [pendingDelete, removeStation]);

  const handleUndoDelete = useCallback(() => {
    if (deleteTimeoutRef.current) {
      clearTimeout(deleteTimeoutRef.current);
      deleteTimeoutRef.current = null;
    }
    if (pendingDelete) {
      const currentStations = [...(useUserPreferencesStore.getState().pinnedStations || [])];
      const targetIndex = Math.min(pendingDelete.index, currentStations.length);
      currentStations.splice(targetIndex, 0, pendingDelete.station);
      reorderStations(currentStations);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setPendingDelete(null);
    }
  }, [pendingDelete, reorderStations]);

  useEffect(() => {
    return () => {
      if (deleteTimeoutRef.current) {
        clearTimeout(deleteTimeoutRef.current);
      }
    };
  }, []);

  const sortedLines = myLines;

  // ── VoiceOver line reorder (parity with DashboardGrid's station handlers) ──
  const handleMoveLineUp = useCallback((currentIndex: number) => {
    if (currentIndex <= 0) return;
    const next = [...sortedLines];
    const [item] = next.splice(currentIndex, 1);
    next.splice(currentIndex - 1, 0, item);
    reorderLines(next.map(l => l.id));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
    AccessibilityInfo.announceForAccessibility(
      `${item.name} moved up to position ${currentIndex} of ${next.length}`
    );
  }, [sortedLines, reorderLines]);

  const handleMoveLineDown = useCallback((currentIndex: number) => {
    if (currentIndex >= sortedLines.length - 1) return;
    const next = [...sortedLines];
    const [item] = next.splice(currentIndex, 1);
    next.splice(currentIndex + 1, 0, item);
    reorderLines(next.map(l => l.id));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
    AccessibilityInfo.announceForAccessibility(
      `${item.name} moved down to position ${currentIndex + 2} of ${next.length}`
    );
  }, [sortedLines, reorderLines]);

  const renderLineItem = useCallback(({ item, drag, isActive, getIndex }: RenderItemParams<LineData>) => {
    const idx = getIndex() ?? sortedLines.findIndex((l: LineData) => l.id === item.id);
    const severity = getDashboardSeverity(item.status, item.status_severity);
    const isExpanded = expandedLineId === item.id;

    const handlePress = () => {
      setExpandedLineId(prev => (prev === item.id ? null : item.id));
    };

    const handleDragWithScrollLock = () => {
      if (expandedLineId === item.id) {
        setExpandedLineId(null);
      }
      setScrollEnabled(false);
      drag();
    };

    const handleDeleteLine = () => {
      if (expandedLineId === item.id) {
        setExpandedLineId(null);
      }
      removeLine(item.id);
    };

    const isDisrupted = severity === 'minor' || severity === 'severe' || severity === 'suspended';
    const isStationOnLine = selectedStations.some((st: any) =>
      Array.isArray(st.lines)
        ? st.lines.some((l: string) => normalizeLineId(l) === normalizeLineId(item.id))
        : false
    );
    const isStationImpacted = isDisrupted && isStationOnLine;

    return (
      <AppleSwipeableRow
        onDelete={handleDeleteLine}
        cardRadius={16}
        marginBottom={12}
        disabled={isActive}
        testID={`swipe-line-${item.id}`}
      >
        <ScaleDecorator activeScale={1.04}>
          <LineCard
            line={item}
            selected={false}
            onPress={handlePress}
            statusType={severity}
            statusLabel={item.status || 'Good service'}
            mode="display"
            onDelete={handleDeleteLine}
            drag={handleDragWithScrollLock}
            isActive={isActive}
            index={idx}
            onMoveUp={handleMoveLineUp}
            onMoveDown={handleMoveLineDown}
            isExpanded={isExpanded}
            onOpenReroute={() => setRerouteLine(item)}
            stationImpacted={isStationImpacted}
            reasonText={item.reason}
          />
        </ScaleDecorator>
      </AppleSwipeableRow>
    );
  }, [sortedLines, removeLine, handleMoveLineUp, handleMoveLineDown, setScrollEnabled, expandedLineId, selectedStations]);
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
          canCancelContentTouches={true}
          bounces={true}
          alwaysBounceVertical={true}
          overScrollMode="always"
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={false}
          onScrollBeginDrag={() => {
            isScrollingRef.current = true;
            pressFeedback.cancelAll();
          }}
          onScrollEndDrag={applyPendingData}
          onMomentumScrollBegin={() => {
            isScrollingRef.current = true;
            pressFeedback.cancelAll();
          }}
          onMomentumScrollEnd={applyPendingData}
          refreshControl={<RefreshControl refreshing={isPullRefreshing} onRefresh={onRefresh} tintColor="rgba(255,255,255,0.6)" />}
        >

          {/* ── Global header ── */}
          <View style={[dash.header, { paddingHorizontal: 4 }]}>
            <View style={dash.titleRow}>
              <Text style={dash.titleMain}>My Commute</Text>
              <View style={dash.headerActions}>
                <BouncyPressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push('/settings');
                  }}
                  style={dash.headerBtnCircle}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Settings"
                  accessibilityRole="button"
                  testID="header-settings-button"
                >
                  <Gear size={18} color="rgba(255, 255, 255, 0.85)" weight="regular" />
                </BouncyPressable>
              </View>
            </View>
            <View style={dash.subheadingArea}>
              <StaleStatusText staleState={staleState} staleMinutes={staleMinutes} />
            </View>
          </View>

          {/* Top spacer below header */}
          <View style={{ height: 12 }} />

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
                  />
                  <NestableDraggableFlatList
                    testID="nestable-draggable-lines"
                    data={sortedLines}
                    keyExtractor={(item: LineData) => item.id}
                    renderItem={renderLineItem}
                    onDragBegin={() => {
                      pressFeedback.cancelAll();
                      setScrollEnabled(false);
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                    }}
                    onRelease={() => {
                      setScrollEnabled(true);
                    }}
                    onDragEnd={({ data }) => {
                      setScrollEnabled(true);
                      reorderLines((data as LineData[]).map(l => l.id));
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    }}
                    onPlaceholderIndexChange={() => {
                      Haptics.selectionAsync().catch(() => { });
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
                          pressRetentionOffset={{ top: 10, left: 10, right: 10, bottom: 10 }}
                          unstable_pressDelay={0}
                          onPressIn={notificationsOffPress.onPressIn}
                          onPressOut={notificationsOffPress.onPressOut}
                          style={[dash.arrivalBanner, notificationsOffPress.animatedStyle, reduceTransparency && { backgroundColor: '#1C1C1E' }]}
                        >
                          {!reduceTransparency && (
                            isNativeGlassAvailable ? (
                              <GlassView
                                glassEffectStyle="regular"
                                colorScheme="dark"
                                style={StyleSheet.absoluteFillObject}
                                pointerEvents="none"
                              />
                            ) : (
                              <BlurView
                                intensity={GLASS.blurIntensity}
                                tint={GLASS.blurTint}
                                style={StyleSheet.absoluteFillObject}
                                pointerEvents="none"
                              />
                            )
                          )}
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
                          pressRetentionOffset={{ top: 10, left: 10, right: 10, bottom: 10 }}
                          unstable_pressDelay={0}
                          onPressIn={snoozedPress.onPressIn}
                          onPressOut={snoozedPress.onPressOut}
                          style={[dash.arrivalBanner, snoozedPress.animatedStyle, reduceTransparency && { backgroundColor: '#1C1C1E' }]}
                        >
                          {!reduceTransparency && (
                            isNativeGlassAvailable ? (
                              <GlassView
                                glassEffectStyle="regular"
                                colorScheme="dark"
                                style={StyleSheet.absoluteFillObject}
                                pointerEvents="none"
                              />
                            ) : (
                              <BlurView
                                intensity={GLASS.blurIntensity}
                                tint={GLASS.blurTint}
                                style={StyleSheet.absoluteFillObject}
                                pointerEvents="none"
                              />
                            )
                          )}
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

              {/* Spacer between sections */}
              <View style={{ height: 12 }} />

              {selectedStations.length > 0 && (
                <View style={dash.section}>
                  <SectionHeader
                    title="My stations"
                    icon={<Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.35)" />}
                    onPressAdd={() => setStationModalVisible(true)}
                  />
                  <DashboardGrid
                    stations={selectedStations}
                    onDelete={handleDeleteStation}
                    onScrollEnabledChange={(enabled) => {
                      setScrollEnabled(enabled);
                    }}
                    onReorderStations={reorderStations}
                    simultaneousHandlers={scrollRef}
                    skipEntrance={hasCompletedFirstEntrance.current}
                    onStationTap={(stationId, stationName) =>
                      router.push(
                        `/station-detail?stationId=${encodeURIComponent(stationId)}&stationName=${encodeURIComponent(stationName)}`
                      )
                    }
                  />
                </View>
              )}
            </>
          )}

          {/* Bottom spacer */}
          <View style={{ flex: 1, minHeight: 180 }} />
        </NestableScrollContainer>

        <ManageLinesModal
          visible={modalVisible}
          onClose={() => {
            setModalVisible(false);
            router.setParams({ manageLines: '' });
          }}
        />

        <ManageStationsModal
          visible={stationModalVisible}
          onClose={() => setStationModalVisible(false)}
        />



        {/* Reroute Screen — full-screen slide-up with the inline direction grid.
            RerouteContainer computes branches/statuses/mode/links AND runs the
            direction engine (useAutoDetectBranch), passing the resolved branch,
            source, and confidence through so the grid can pre-highlight. */}
        {rerouteLine && (
          <RerouteContainer
            rerouteLine={rerouteLine}
            selectedStations={selectedStations}
            initialSection={rerouteInitialSection}
            onClose={() => {
              setRerouteLine(null);
              setRerouteInitialSection('overview');
            }}
          />
        )}
      </View>

      {/* 4-second reversible delete undo toast */}
      {pendingDelete && (
        <Animated.View
          entering={FadeInDown.duration(200)}
          exiting={FadeOutDown.duration(200)}
          style={[
            dash.undoToastContainer,
            { bottom: Math.max(insets.bottom + 16, 24) },
          ]}
          testID="delete-undo-toast"
        >
          <View style={dash.undoToastContent}>
            <Text style={dash.undoToastText} numberOfLines={1}>
              {pendingDelete.station.name.replace(/\s*(?:Underground Station|Elizabeth line Station|Overground Station|DLR Station|Rail Station|Station)$/i, '')} removed
            </Text>
            <Pressable
              onPress={handleUndoDelete}
              style={dash.undoToastButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Undo removing station"
              testID="delete-undo-button"
            >
              <Text style={dash.undoToastButtonText}>Undo</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}
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
  initialSection?: 'overview' | 'alternatives';
  onClose: () => void;
}

function RerouteContainer({ rerouteLine, selectedStations, initialSection = 'overview', onClose }: RerouteContainerProps) {
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

  // Match the engine's resolved route, branchId, or terminus to our grid tiles
  const matchedEngineBranch = engineBranch
    ? branches.find((b) => {
      const bLower = b.toLowerCase().replace(/\bbranch\b/g, '').trim();
      // 1. Direct or substring match with terminus
      if (
        engineBranch.terminus &&
        (b.toLowerCase() === engineBranch.terminus.toLowerCase() ||
          bLower === engineBranch.terminus.toLowerCase() ||
          engineBranch.terminus.toLowerCase().includes(bLower) ||
          bLower.includes(engineBranch.terminus.toLowerCase()))
      ) {
        return true;
      }
      // 2. Check routeName / branchId (e.g. "Edgware ↔ Morden via Bank" or "edgware-via-bank" -> "Bank branch")
      if (
        engineBranch.routeName &&
        bLower.length >= 3 &&
        engineBranch.routeName.toLowerCase().includes(bLower)
      ) {
        return true;
      }
      if (
        engineBranch.branchId &&
        bLower.length >= 3 &&
        engineBranch.branchId.toLowerCase().includes(bLower)
      ) {
        return true;
      }
      return false;
    })
    : null;

  // Fallback: the line's default terminus (branches[0])
  const resolvedTerminus =
    matchedEngineBranch ??
    (branches.includes(engineBranch?.terminus ?? '')
      ? engineBranch!.terminus
      : defaultTerminus);
  const resolvedSource = engineBranch ? result.source : 'manual';
  const resolvedConfidence = engineBranch ? result.confidence : 'low';

  // Per-branch status: parse disruption reason with stopword-safe matching.
  const reasonText = rerouteLine.reason || rerouteLine.status || '';
  const lineWide = isLineWideDisruption(reasonText, rerouteLine.status);

  const hasMentionedBranch = branches.some((branch: string) =>
    isBranchMentioned(branch, reasonText)
  );

  const branchStatuses = branches.reduce((acc: Record<string, 'affected' | 'unaffected'>, branch: string) => {
    if (lineWide) {
      acc[branch] = 'affected';
    } else {
      const isMentioned = isBranchMentioned(branch, reasonText);
      // If specific branch is mentioned, mark affected.
      // If no branch mentioned at all (and not line-wide), default resolved tile to affected (never false calm).
      acc[branch] =
        isMentioned || (!hasMentionedBranch && branch === resolvedTerminus)
          ? 'affected'
          : 'unaffected';
    }
    return acc;
  }, {} as Record<string, 'affected' | 'unaffected'>);

  const resolution = resolveRerouteMode({
    stationId,
    confirmedTerminus: resolvedTerminus,
    otherTerminus,
    expectedLineId: rerouteLine.id,
    fallbackStatusType: getDashboardSeverity(rerouteLine.status, rerouteLine.status_severity),
    fallbackReason: rerouteLine.reason || rerouteLine.status,
  });
  const links = buildRerouteLinks(resolvedTerminus);

  const isCleared =
    Boolean(rerouteLine.status?.toLowerCase().includes('good service')) ||
    rerouteLine.status_severity === 10 ||
    rerouteLine.status_severity === 1;

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
      initialSection={initialSection}
      isCleared={isCleared}
    />
  );
}

const dash = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0F' },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  titleMain: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 28, color: '#FFFFFF', letterSpacing: -0.5, lineHeight: 32, flexShrink: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  headerBtnCircle: {
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
  },
  undoToastContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9998,
  },
  undoToastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(25, 25, 30, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderTopColor: GLASS.borderTop,
    borderBottomColor: GLASS.borderBottom,
  },
  undoToastText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 14,
    color: '#FFFFFF',
    flex: 1,
    marginRight: 12,
  },
  undoToastButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  undoToastButtonText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 13,
    color: '#0A84FF',
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
    borderRadius: 16,
    borderWidth: GLASS.borderWidth,
    borderColor: GLASS.borderColor,
    borderTopColor: GLASS.borderTop,
    borderBottomColor: GLASS.borderBottom,
    backgroundColor: GLASS.background,
    height: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    position: 'relative',
    overflow: 'hidden',
    marginBottom: 12,
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
    borderWidth: GLASS.borderWidth,
    borderColor: GLASS.borderColor,
    borderTopColor: GLASS.borderTop,
    borderBottomColor: GLASS.borderBottom,
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