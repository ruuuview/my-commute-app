/**
 * MyCommuteDashboard.tsx
 * ─────────────────────────────────────────────────────────────────
 * "Refined Transit Intelligence" — Bloomberg Terminal × Apple Maps
 * ─────────────────────────────────────────────────────────────────
 */

import React, { useCallback, useEffect, useState, useMemo, memo, forwardRef } from 'react';

import {
  Platform,
  Pressable,
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
  Easing,
  useReducedMotion,
  withSpring,
  withDelay
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import {
  NestableScrollContainer,
  NestableDraggableFlatList,
} from 'react-native-draggable-flatlist';

// ✅ Wired directly to our Zustand + MMKV Brain
import { useUserPreferencesStore, UserPreferencesState } from '../store/userPreferencesStore';
import { useShallow } from 'zustand/react/shallow';
import { useLineDataStore } from '../store/lineDataStore';

import { useTflPoller } from '../hooks/useTflPoller';
import type { StatusLevel } from '../hooks/useWorstStatus';
import { Ionicons } from '@expo/vector-icons';
import { useDeferredPermissionTriggers } from '../hooks/useDeferredPermissionTriggers';
import { usePressAnimation } from '../hooks/usePressAnimation';
import { ManageLinesModal } from './ManageLinesModal';
import { ManageStationsModal } from './ManageStationsModal';
import { LineDetailModal } from './LineDetailModal';
import { LineCard } from './LineCard';
import { APP_CONFIG } from '../config/app.config';
import { DashboardGradient } from './DashboardGradient';
import DepartureCard from './DepartureCard';
// @ts-ignore - IDE caching issue for newly created file
import { StationDetailModal } from './StationDetailModal'; // Resolved import
import { useStationDataStore } from '../store/stationDataStore';
import { DashboardSkeleton } from './DashboardSkeleton';
import LivingDot from './LivingDot';
import BouncyPressable from './BouncyPressable';
import { processStationArrivals } from '../utils/groupStationDepartures';
import { resolveTflStopIds } from '../utils/resolveTflStopId';
import { LINE_COLORS } from '../constants/lineColors';
import { scheduleCalendarCommuteAlerts } from '../services/calendarScheduler';
import { LINE_SHORT_NAMES } from '../data/lineMetadata';

// FIX 3: LayoutAnimation removed entirely — it conflicts with Reanimated springs
// on StaggeredCardWrapper when toggling edit mode, causing card jump/misalignment.
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
  if (text.includes('minor') || text.includes('reduced') || text.includes('part')) return 'minor';
  if (text.includes('suspended') || text.includes('closure') || text.includes('closed')) return 'suspended';
  if (text.includes('severe') || text.includes('delay')) return 'severe';
  if (text.includes('offline')) return 'offline';
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

const SectionHeader: React.FC<{
  title: string;
  onPressAdd?: () => void;
  isEditing: boolean;
  plusRef?: React.RefObject<any>;
}> = ({ title, onPressAdd, isEditing, plusRef }) => {
  const pressAnim = usePressAnimation('back_btn', false);
  return (
    <View style={[section.row, isEditing && { marginBottom: 20 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        <Text style={section.title}>{title}</Text>
      </View>
      {onPressAdd && (
        <Pressable
          onPress={onPressAdd}
          onPressIn={pressAnim.onPressIn}
          onPressOut={pressAnim.onPressOut}
        >
          <Animated.View style={[section.addBtn, isEditing && { marginRight: 12 }, pressAnim.animatedStyle]}>
            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFillObject} />
            <Ionicons name="add" size={16} color="#FFFFFF" style={{ alignSelf: 'center' }} />
          </Animated.View>
        </Pressable>
      )}
    </View>
  );
};

const section = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginTop: 4 },
  title: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 11, letterSpacing: 0.1, color: 'rgba(255,255,255,0.58)' },
  addBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
});

// ─── Staggered Card Wrapper ──────────────────────────────────────
const StaggeredCardWrapper = memo(
  forwardRef<View, { children: React.ReactNode; index: number }>(
    ({ children, index }, ref) => {
      const translateY = useSharedValue(16);
      const opacity = useSharedValue(0);
      const reducedMotion = useReducedMotion();

      useEffect(() => {
        if (reducedMotion) {
          translateY.value = 0;
          opacity.value = 1;
          return;
        }
        const phaseDelay = (index * 23) % 150;
        const delay = 120 + phaseDelay;
        translateY.value = withDelay(delay, withSpring(0, { damping: 22, stiffness: 200 }));
        opacity.value = withDelay(delay, withTiming(1, { duration: 320, easing: Easing.out(Easing.poly(4)) }));
      }, [index, reducedMotion, translateY, opacity]);

      const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
        opacity: opacity.value,
      }));

      return (
        <View ref={ref} collapsable={false}>
          <Animated.View style={animatedStyle}>
            {children}
          </Animated.View>
        </View>
      );
    }
  )
);
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

  const { resetOnboarding, selectedLines, selectedStations, removeLine, removeStation, lastKnownData, setLastKnown, calendarGranted, reorderStations, reorderLines } = useUserPreferencesStore(useShallow((s: UserPreferencesState) => ({
    resetOnboarding: s.resetOnboarding,
    selectedLines: s.selectedLines || [],
    selectedStations: s.pinnedStations || [],
    removeLine: s.toggleLine,
    removeStation: s.unpinStation,
    lastKnownData: s.lastKnownData || [],
    setLastKnown: s.setLastKnown,
    calendarGranted: s.calendarGranted,
    reorderStations: s.reorderStations,
    reorderLines: s.reorderLines,
  })));

  const [linesModalVisible, setLinesModalVisible] = useState(false);
  const [stationsModalVisible, setStationsModalVisible] = useState(false);
  const [selectedLineForModal, setSelectedLineForModal] = useState<LineData | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData>({ lines: lastKnownData, stations: [] });
  const [isEditing, setIsEditing] = useState(false);

  // Sync unmount guard for deleted/removed selectedStationId
  useEffect(() => {
    if (selectedStationId) {
      const isPinned = selectedStations.some(s => s.id === selectedStationId);
      if (!isPinned) {
        setSelectedStationId(null);
      }
    }
  }, [selectedStations, selectedStationId]);

  const linesPlusRef = React.useRef<any>(null);
  const stationsPlusRef = React.useRef<any>(null);
  const isDragging = useSharedValue(false);
  const headerBtnAnim = usePressAnimation('back_btn', false);

  // ✅ Deferred Permission Trigger System (Phase 6)
  const {
    shouldShowNotificationPrompt,
    shouldShowCalendarPrompt,
    requestCalendarPermission,
    requestNotificationPermission,
  } = useDeferredPermissionTriggers();

  const sortedLines = useMemo(() => {
    return selectedLines.map((id) => {
      const found = data.lines.find((l) => l.id === id);
      if (found) return found;
      return {
        id,
        name: LINE_SHORT_NAMES[id] || (id.charAt(0).toUpperCase() + id.slice(1)),
        color: LINE_COLORS[id] || '#888',
        status: 'Offline',
      };
    });
  }, [data.lines, selectedLines]);

  const hasContent = selectedLines.length > 0 || selectedStations.length > 0;

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
      scheduleCalendarCommuteAlerts().catch((e) =>
        console.error('Calendar scheduling failed:', e)
      );
    }

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && calendarGranted) {
        scheduleCalendarCommuteAlerts().catch((e) =>
          console.error('Calendar scheduling failed:', e)
        );
      }
    });

    return () => {
      subscription.remove();
    };
  }, [calendarGranted]);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    try {
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
      }));

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

            // Delegate all dedup/sort/group/cap logic to the shared utility
            const stationLineList = processStationArrivals(allRawDepartures, st.id);
            useStationDataStore.getState().setDepartures(st.id, stationLineList);

            return {
              id: st.id,
              name: st.name,
              arrivals: []
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

      useLineDataStore.getState().setLines(raw.map((item: any) => {
        const s = String(item?.status ?? '').toLowerCase();
        let status_severity = 1;
        if (s.includes('part closure') || s.includes('suspended') || s.includes('closure')) {
          status_severity = 20;
        } else if (s.includes('severe')) {
          status_severity = 9;
        } else if (s.includes('minor') || s.includes('part') || s.includes('reduced')) {
          status_severity = 5;
        }

        return {
          id: String(item?.id ?? ''),
          name: String(item?.name ?? ''),
          color: LINE_COLORS[String(item?.id ?? '')] || '#888',
          status: String(item?.status ?? ''),
          status_severity,
          reason: item?.reason || item?.statusSeverityDescription || '',
        };
      }));

      const myFreshLines = freshLines.filter((l: any) => selectedLines.includes(l.id));
      const worst = worstSeverity(myFreshLines);
      setLastKnown(worst as StatusLevel, freshLines);

      return { status: response.status, lastUpdated: raw[0]?.updated_at };
    } catch (err: any) {
      console.log('Fetch error');
      throw err;
    }
  }, [selectedStations, selectedLines, setLastKnown]);

  const { forceRefresh, isLoading } = useTflPoller(fetchData);

  const onRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await forceRefresh();
  }, [forceRefresh]);

  // FIX 3: LayoutAnimation stripped — was conflicting with StaggeredCardWrapper
  // springs causing card misalignment on edit mode exit. Reanimated owns layout.
  const handleEdit = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsEditing((v) => !v);
  }, []);

  const networkSeverity = useMemo(() => worstSeverity(sortedLines), [sortedLines]);

  // FIX 2: Backdrop dismiss moved outside NestableScrollContainer.
  // Previously this Pressable was inside the scroll container with pointerEvents="box-none"
  // which caused the scroll container to swallow the touch before the Pressable caught it.
  // Now it's a sibling absolute layer rendered at the root level below the scroll content.
  const handleBackdropPress = useCallback(() => {
    if (isDragging.value) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsEditing(false);
  }, [isDragging]);

  return (
    <Pressable
      style={dash.root}
    >
      <DashboardGradient severity={networkSeverity} />
      <Animated.View
        collapsable={false}
        style={[{ flex: 1, paddingTop: insets.top }, revealStyle]}
        pointerEvents="box-none"
      >
        {/* Background interaction layer — always mounted, sits at zIndex 0 below cards.
            Tap empty space while editing → exit edit mode.
            Cards sit at zIndex 1 above this, so their gestures always win.
            FIX 4: Long-press entry into edit mode removed from here. Reordering now
            begins directly on the card via NestableDraggableFlatList's onDragBegin
            (see the lists below) — holding the item you want to move, not empty
            space, matching the platform convention this whole feature is modeled on. */}
        <Pressable
          style={[StyleSheet.absoluteFillObject, dash.backgroundLayer]}
          onPress={isEditing ? handleBackdropPress : undefined}
          accessibilityLabel={isEditing ? 'Exit edit mode' : undefined}
          accessibilityRole={isEditing ? 'button' : undefined}
        />

        {/* ── Content — zIndex 1 sits above backdrop ── */}
        <NestableScrollContainer
          style={[dash.scroll, { zIndex: 1 }]}
          contentContainerStyle={[dash.scrollContent, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={onRefresh}
              tintColor="rgba(255,255,255,0.6)"
            />
          }
          pointerEvents="box-none"
        >
          <Pressable
            style={{ flex: 1 }}
            onPress={isEditing ? handleBackdropPress : undefined}
          >
          {/* ── Global header ── */}
          <View style={[dash.header, { paddingHorizontal: 4, zIndex: 1 }]} pointerEvents="box-none">
            <View style={dash.titleRow}>
              <Text style={dash.titleMain}>My Commute</Text>
              <View style={dash.headerActions}>
                {hasContent && (
                  <Animated.View style={headerBtnAnim.animatedStyle}>
                    <Pressable
                      onPress={handleEdit}
                      onPressIn={headerBtnAnim.onPressIn}
                      onPressOut={headerBtnAnim.onPressOut}
                      style={dash.headerBtn}
                      hitSlop={8}
                    >
                      <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFillObject} />
                      <Text style={dash.headerBtnText}>{isEditing ? 'Done' : 'Edit'}</Text>
                    </Pressable>
                  </Animated.View>
                )}
              </View>
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

              {__DEV__ && (
                <BouncyPressable onPress={() => resetOnboarding()} style={[dash.ghostBtn, { marginTop: 16 }]}>
                  <Text style={[dash.ghostBtnTxt, { color: '#ff4444' }]}>Reset Onboarding (Debug)</Text>
                </BouncyPressable>
              )}
            </View>
          )}

          {hasContent && isLoading && data.lines.length === 0 ? (
            <DashboardSkeleton />
          ) : (
            <>
              {sortedLines.length > 0 && (
                <View style={[dash.section, { zIndex: 1 }]} pointerEvents="box-none">
                  <SectionHeader
                    title="My lines"
                    onPressAdd={() => setLinesModalVisible(true)}
                    isEditing={isEditing}
                    plusRef={linesPlusRef}
                  />
                  <NestableDraggableFlatList
                    data={sortedLines}
                    keyExtractor={(item) => item.id}
                    style={{ overflow: 'visible' }}
                    contentContainerStyle={{ overflow: 'visible' }}
                    // FIX 4: onDragBegin is now the single entry point into edit mode.
                    // Holding any card both starts the drag AND flips isEditing — no
                    // separate background long-press needed first. Haptic fires once,
                    // only on the transition into edit mode, not on every drag.
                    onDragBegin={() => {
                      isDragging.value = true;
                      setIsEditing((wasEditing) => {
                        if (!wasEditing) {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        }
                        return true;
                      });
                    }}
                    onDragEnd={({ data }) => {
                      isDragging.value = false;
                      reorderLines(data.map((l) => l.id));
                    }}
                    // FIX 1: Added onDragCancel — previously isDragging was never
                    // reset when the gesture was abandoned (no drag actually happened).
                    // This left the scroll container in a frozen locked state.
                    onRelease={() => {
                      // Fires when finger lifts without completing a drag
                      isDragging.value = false;
                    }}
                    renderItem={({ item, drag, isActive, getIndex }) => {
                      const index = getIndex();
                      return (
                        <StaggeredCardWrapper index={index ?? 0}>
                          <LineCard
                            line={item}
                            selected={false}
                            onPress={() => {
                              // Only open modal when NOT in edit mode
                              if (!isEditing) {
                                setSelectedLineForModal(item);
                              }
                            }}
                            // FIX 4: Long press is now a single unconditional path: drag.
                            // It works identically whether edit mode is already active
                            // or not — onDragBegin above is what flips isEditing. The
                            // status modal is reachable by tap only, in either state.
                            onLongPress={drag}
                            statusType={parseSeverity(item.status)}
                            statusLabel={item.status}
                            cardHeight={38}
                            mode="display"
                            isEditing={isEditing}
                            onDelete={removeLine}
                            drag={isEditing ? drag : undefined}
                            isActive={isActive}
                            index={index ?? 0}
                          />
                        </StaggeredCardWrapper>
                      );
                    }}
                  />
                </View>
              )}

              {(selectedStations.length > 0 || isEditing) && (
                <View style={[dash.section, { zIndex: 1 }]} pointerEvents="box-none">
                  <SectionHeader
                    title="My stations"
                    onPressAdd={() => setStationsModalVisible(true)}
                    isEditing={isEditing}
                    plusRef={stationsPlusRef}
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
                    <NestableDraggableFlatList
                      data={selectedStations}
                      keyExtractor={(item) => item.id}
                      style={{ overflow: 'visible' }}
                      contentContainerStyle={{ overflow: 'visible' }}
                      // FIX 4: Same single-entry-point pattern as the lines list above —
                      // holding a station card starts the drag and flips isEditing together.
                      onDragBegin={() => {
                        isDragging.value = true;
                        setIsEditing((wasEditing) => {
                          if (!wasEditing) {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          }
                          return true;
                        });
                      }}
                      onDragEnd={({ data }) => {
                        isDragging.value = false;
                        reorderStations(data);
                      }}
                      // FIX 1: Same onRelease guard for stations list
                      onRelease={() => {
                        isDragging.value = false;
                      }}
                      renderItem={({ item, drag, isActive, getIndex }) => {
                        const index = getIndex();
                        return (
                          <StaggeredCardWrapper index={index ?? 0}>
                            <DepartureCard
                              stationId={item.id}
                              stationName={item.name}
                              isEditing={isEditing}
                              onDelete={removeStation}
                              onLongPress={drag}
                              onPress={() => setSelectedStationId(item.id)}
                              drag={drag}
                              isActive={isActive}
                              index={index ?? 0}
                              defaultExpanded={true}
                            />
                          </StaggeredCardWrapper>
                        );
                      }}
                    />
                  )}
                </View>
              )}

              {/* Spacer filling remaining height */}
              <View
                style={{ flex: 1, minHeight: 150 }}
              />
            </>
          )}
          </Pressable>
        </NestableScrollContainer>

        {/* ✅ Modals rendered at root level — immediate state sync */}
        <ManageLinesModal
          visible={linesModalVisible}
          onClose={() => setLinesModalVisible(false)}
        />
        <ManageStationsModal
          visible={stationsModalVisible}
          onClose={() => setStationsModalVisible(false)}
        />
        <LineDetailModal
          visible={selectedLineForModal !== null}
          onClose={() => setSelectedLineForModal(null)}
          line={selectedLineForModal}
          statusType={selectedLineForModal ? parseSeverity(selectedLineForModal.status) : 'loading'}
          statusLabel={selectedLineForModal ? selectedLineForModal.status : ''}
        />
        <StationDetailModal
          visible={selectedStationId !== null}
          onClose={() => setSelectedStationId(null)}
          stationId={selectedStationId || ''}
        />

        {/* Deferred Notification Modal */}
        <Modal
          visible={showNotifPrompt}
          transparent
          animationType="slide"
          presentationStyle="overFullScreen"
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
          animationType="slide"
          presentationStyle="overFullScreen"
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
    </Pressable>
  );
};

const dash = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0F' },
  // Background interaction layer — zIndex 0, always below cards (zIndex 1)
  backgroundLayer: {
    zIndex: 0,
  },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  titleMain: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 28, color: '#FFFFFF', letterSpacing: -0.5, lineHeight: 32 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.12)',
    minWidth: 64,
  },
  headerBtnText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.80)',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, flexGrow: 1 },
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