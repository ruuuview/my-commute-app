/**
 * MyCommuteDashboard.tsx
 * ─────────────────────────────────────────────────────────────────
 * "Refined Transit Intelligence" — Bloomberg Terminal × Apple Maps
 * Direct Manipulation Metaphor: Modeless elastic swipe-to-delete,
 * direct long-press drag-to-reorder, zero edit mode chrome.
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
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { PREMIUM_BUTTON, GLASS } from '../theme/colors';
import { deleteCachedArrivals } from '../services/stationArrivalsStore';

// ✅ Wired directly to our Zustand + MMKV Brain
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { useShallow } from 'zustand/react/shallow';
import { useTflPoller } from '../hooks/useTflPoller';
import LiveActivityService from '../services/LiveActivityService';
import { normaliseLineId } from '../utils/normaliseLineId';
import { tflCapitalise } from '../utils/tflCapitalise';
import { useWorstStatus, computeWorstStatus } from '../hooks/useWorstStatus';
import { Ionicons } from '@expo/vector-icons';
import { Gear } from 'phosphor-react-native';
import { ManageLinesModal } from './ManageLinesModal';
import { ManageStationsModal } from './ManageStationsModal';
import { usePressAnimation } from '../hooks/usePressAnimation';
import { useLiveReducedMotion } from '../hooks/useReducedMotion';
import { useScrollLock } from '../hooks/useScrollLock';
import { DashboardGradient } from './DashboardGradient';
import { LineCard } from './LineCard';
import { NestableScrollContainer, NestableDraggableFlatList, RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import DashboardGrid from './DashboardGrid';
import SwipeableRow from './SwipeableRow';
import { LineDetailModal } from './LineDetailModal';
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

function getDashboardSeverity(statusText: string, statusSeverity?: number): Severity {
  const text = String(statusText ?? '').toLowerCase();
  if (text.includes('offline') || text.includes('connection') || text.includes('loading') || text.includes('unknown')) {
    return 'unknown';
  }
  return getSeverityColor(statusSeverity, statusText).label;
}

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
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
    lineHeight: 18,
  },
});

function StaleStatusText({ staleState, staleMinutes }: { staleState: import('../hooks/useTflPoller').StaleState; staleMinutes: number }) {
  if (staleState === 'offline') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <NetworkHealthDot severity="offline" />
        <Text style={dash.staleText} accessibilityLabel="Network offline, displaying cached TfL transit data">
          Offline — cached data
        </Text>
      </View>
    );
  }
  if (staleState === 'tfl-error' || staleState === 'tfl-delayed') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <NetworkHealthDot severity="minor" />
        <Text style={dash.staleText} accessibilityLabel={`Transit data updated ${staleMinutes} minutes ago`}>
          Updated {staleMinutes}m ago
        </Text>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <NetworkHealthDot severity="good" />
      <Text style={[dash.staleText, { color: 'rgba(255, 255, 255, 0.45)' }]} accessibilityLabel="Transit network status is live">
        Live service
      </Text>
    </View>
  );
}

// ─── Session-Level Intent Deduplication Sets ──────────────────────
// Survives React component unmount/remount cycles during tab switching
const sessionConsumedManageLinesNonces = new Set<string>();
const sessionConsumedNotificationNonces = new Set<string>();
const sessionConsumedLegacyLineIds = new Set<string>();

// ─── Main Dashboard Component ─────────────────────────────────────
export function MyCommuteDashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const searchParams = useLocalSearchParams<{
    openRerouteLineId?: string;
    notificationIntent?: string;
    notificationNonce?: string;
    manageLines?: string;
  }>();
  const reduceTransparency = useReduceTransparency();

  const [data, setData] = useState<DashboardData>({ lines: [] });
  const [rerouteLine, setRerouteLine] = useState<LineData | null>(null);
  const [rerouteInitialSection, setRerouteInitialSection] = useState<'overview' | 'alternatives'>('overview');
  const lastConsumedNonceRef = useRef<string | null>(null);
  const lastConsumedLegacyLineRef = useRef<string | null>(null);
  const lastConsumedManageLinesNonceRef = useRef<string | null>(null);

  const {
    selectedLines,
    pinnedStations,
    resetOnboarding,
    removeLine,
    reorderLines,
    removeStation,
    reorderStations,
    lastKnownData,
    setLastKnown,
    arrivalNotificationsEnabled,
    setArrivalNotificationsEnabled,
    arrivalSnoozeExpiry,
    setArrivalSnoozeExpiry,
    labelsConfirmed,
    completedJourneys,
    hasSeenConfirmationCard,
  } = useUserPreferencesStore(
    useShallow((s) => ({
      selectedLines: s.selectedLines || [],
      pinnedStations: s.pinnedStations || [],
      resetOnboarding: s.resetOnboarding,
      removeLine: s.toggleLine,
      reorderLines: s.reorderLines,
      removeStation: s.unpinStation,
      reorderStations: s.reorderStations,
      lastKnownData: s.lastKnownData || [],
      setLastKnown: s.setLastKnown,
      arrivalNotificationsEnabled: s.arrivalNotificationsEnabled,
      setArrivalNotificationsEnabled: s.setArrivalNotificationsEnabled,
      arrivalSnoozeExpiry: s.arrivalSnoozeExpiry,
      setArrivalSnoozeExpiry: s.setArrivalSnoozeExpiry,
      labelsConfirmed: s.labelsConfirmed,
      completedJourneys: s.completedJourneys,
      hasSeenConfirmationCard: s.hasSeenConfirmationCard,
    }))
  );

  const selectedStations = useMemo(() => pinnedStations || [], [pinnedStations]);

  const [modalVisible, setModalVisible] = useState(false);
  const [stationModalVisible, setStationModalVisible] = useState(false);

  const scrollRef = useRef<any>(null);

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
    }
  }, []);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`${APP_CONFIG.BACKEND_URL}/api/lines`, { signal });
      if (!response.ok) {
        return { status: response.status };
      }

      const raw = await response.json();

      const freshLines: LineData[] = raw.map((item: any) => ({
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
      OVERGROUND_BRANCH_IDS.forEach((branchId) => {
        const branchData = freshLines.find((l: any) => l.id === branchId);
        if (branchData) {
          foundAny = true;
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

      // Populate global line status store
      useLineDataStore.getState().setLines(freshLines as any);

      // Sync fresh line statuses to WidgetKit AppGroup cache
      if (Platform.OS === 'ios' && selectedLines && selectedLines.length > 0) {
        const customStatuses = selectedLines.map((id: string) => {
          const norm = normaliseLineId(id);
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
      console.log('[MyCommuteDashboard] Fetch error:', err);
      throw err;
    }
  }, [selectedLines, setLastKnown]);

  const {
    forceRefresh,
    isLoading,
    staleState,
    staleMinutes,
  } = useTflPoller(fetchData, lastKnownData && lastKnownData.length > 0);

  const onRefresh = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    await forceRefresh();
  }, [forceRefresh]);

  const myLines = useMemo(() => {
    return selectedLines.map((id) => {
      const match = data.lines.find((l) => l.id.toLowerCase() === id.toLowerCase());
      if (match) return match;
      return {
        id,
        name: tflCapitalise(id),
        color: LINE_IDENTITY_COLORS[id] || '#8E8E93',
        status: staleState === 'offline'
          ? 'Offline'
          : (staleState === 'tfl-error' ? 'Connection error' : 'Loading status...'),
        status_severity: staleState ? 0 : 10,
      };
    });
  }, [selectedLines, data.lines, staleState]);

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
      targetLineId = normaliseLineId(String(searchParams.openRerouteLineId)).lineId;
      action = 'show-reroute';
      sessionConsumedLegacyLineIds.add(String(searchParams.openRerouteLineId));
      lastConsumedLegacyLineRef.current = searchParams.openRerouteLineId;
    }

    if (targetLineId) {
      const matched = data.lines.find((l) => l.id.toLowerCase() === targetLineId!.toLowerCase());
      const lineData: LineData = matched || {
        id: targetLineId,
        name: tflCapitalise(targetLineId),
        color: LINE_IDENTITY_COLORS[targetLineId] || '#8E8E93',
        status: 'Severe Delays',
        status_severity: 6,
        reason: 'Disruption reported on line.',
      };

      if (action === 'show-reroute') {
        setRerouteInitialSection(initialSection);
        setRerouteLine(lineData);
        setSelectedLineInfo(null);
      } else {
        setRerouteLine(null);
        const cardRef = itemRefs.current[targetLineId];
        if (cardRef && typeof cardRef.measureInWindow === 'function') {
          cardRef.measureInWindow((x, y, width, height) => {
            setSelectedLineInfo({ id: targetLineId!, anchorRect: { x, y, width, height } });
          });
        } else {
          setSelectedLineInfo({ id: targetLineId, anchorRect: null });
        }
      }

      router.setParams({
        notificationIntent: '',
        notificationNonce: '',
        openRerouteLineId: '',
      });
    }
  }, [searchParams.manageLines, searchParams.notificationIntent, searchParams.notificationNonce, searchParams.openRerouteLineId, data.lines, router]);

  const [isDraggingLine, setIsDraggingLine] = useState(false);
  const [isDraggingStation, setIsDraggingStation] = useState(false);

  const { scrollEnabled, setScrollEnabled } = useScrollLock({
    onForceReset: () => {
      setIsDraggingLine(false);
      setIsDraggingStation(false);
    },
  });

  const [selectedLineInfo, setSelectedLineInfo] = useState<{ id: string; anchorRect: any } | null>(null);
  const selectedLineForModal = useMemo(() => {
    if (!selectedLineInfo?.id) return null;
    const found = data.lines.find(l => l.id.toLowerCase() === selectedLineInfo.id.toLowerCase());
    if (found) return found;
    const id = selectedLineInfo.id.toLowerCase();
    const name = id.charAt(0).toUpperCase() + id.slice(1);
    return {
      id,
      name: `${name} line`,
      color: LINE_IDENTITY_COLORS[id] || '#8E8E93',
      status: 'Severe Delays',
      status_severity: 6,
      reason: 'Disruption reported on line.',
    };
  }, [data.lines, selectedLineInfo]);

  const notificationsOffPress = usePressAnimation('departure_card', false);
  const snoozedPress = usePressAnimation('departure_card', false);

  const handleDeleteStation = useCallback((stationId: string) => {
    deleteCachedArrivals(stationId);
    removeStation(stationId);
  }, [removeStation]);

  const sortedLines = myLines;
  const itemRefs = useRef<Record<string, View>>({});

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

    const handlePress = () => {
      const ref = itemRefs.current[item.id];
      if (ref) {
        ref.measureInWindow((x, y, width, height) => {
          setSelectedLineInfo({ id: item.id, anchorRect: { x, y, width, height } });
        });
      }
    };

    return (
      <ScaleDecorator activeScale={1.04}>
        <SwipeableRow
          id={item.id}
          name={item.name}
          onDelete={removeLine}
          onMoveUp={() => handleMoveLineUp(idx)}
          onMoveDown={() => handleMoveLineDown(idx)}
          isDragging={isActive}
          borderRadius={16}
          marginBottom={12}
          testID={`swipeable-line-${item.id}`}
        >
          <View
            ref={el => { if (el) itemRefs.current[item.id] = el; }}
            style={{ height: 46 }}
          >
            <LineCard
              line={item}
              selected={false}
              onPress={handlePress}
              statusType={severity}
              statusLabel={item.status || 'Good service'}
              cardHeight={46}
              mode="display"
              drag={drag}
              isActive={isActive}
              index={idx}
            />
          </View>
        </SwipeableRow>
      </ScaleDecorator>
    );
  }, [sortedLines, removeLine, handleMoveLineUp, handleMoveLineDown]);

  const worstStatus = useWorstStatus(selectedLines);
  const networkSeverity = useMemo(() => {
    if (staleState === 'offline') return 'offline';
    return worstStatus as Severity;
  }, [staleState, worstStatus]);

  const hasContent = selectedLines.length > 0 || selectedStations.length > 0;

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
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor="rgba(255,255,255,0.6)" />}
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
                      setIsDraggingLine(true);
                      setScrollEnabled(false);
                    }}
                    onRelease={() => {
                      setIsDraggingLine(false);
                      setScrollEnabled(true);
                    }}
                    onDragEnd={({ data }) => {
                      setIsDraggingLine(false);
                      setScrollEnabled(true);
                      reorderLines((data as LineData[]).map(l => l.id));
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
                  {selectedStations.length > 0 && completedJourneys > 0 && !labelsConfirmed && !hasSeenConfirmationCard && (
                    <View style={{ paddingHorizontal: 4, marginBottom: 12 }}>
                      <ConfirmationCard />
                    </View>
                  )}

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
                      setIsDraggingStation(!enabled);
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
    </View>
  );
}

// ─── Reroute Container ─────────────────────────────────────────────
interface RerouteContainerProps {
  rerouteLine: LineData;
  selectedStations: { id: string; name: string; lines?: string[]; role?: string }[];
  initialSection?: 'overview' | 'alternatives';
  onClose: () => void;
}

function RerouteContainer({ rerouteLine, selectedStations, initialSection = 'overview', onClose }: RerouteContainerProps) {
  const scopedStation =
    selectedStations.find((st) =>
      Array.isArray(st.lines) ? st.lines.includes(rerouteLine.id) : false
    ) ||
    selectedStations.find((st) => st.role === 'home' || st.role === 'work') ||
    selectedStations[0];
  const stationId = scopedStation?.id || '';
  const stationName = scopedStation?.name;

  const { result } = useAutoDetectBranch(rerouteLine.id, stationId || undefined, stationName);

  const branches = REROUTE_LINE_BRANCHES[rerouteLine.id] || [];
  const defaultTerminus = branches[0] || rerouteLine.name;
  const otherTerminus = branches[1] || '';

  const engineBranch =
    result.branch && !('possibleBranches' in result.branch)
      ? (result.branch as ResolvedBranch)
      : null;

  const matchedEngineBranch = engineBranch
    ? branches.find((b) => {
      const bLower = b.toLowerCase().replace(/\bbranch\b/g, '').trim();
      if (
        engineBranch.terminus &&
        (b.toLowerCase() === engineBranch.terminus.toLowerCase() ||
          bLower === engineBranch.terminus.toLowerCase() ||
          engineBranch.terminus.toLowerCase().includes(bLower) ||
          bLower.includes(engineBranch.terminus.toLowerCase()))
      ) {
        return true;
      }
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

  const resolvedTerminus =
    matchedEngineBranch ??
    (branches.includes(engineBranch?.terminus ?? '')
      ? engineBranch!.terminus
      : defaultTerminus);
  const resolvedSource = engineBranch ? result.source : 'manual';
  const resolvedConfidence = engineBranch ? result.confidence : 'low';

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