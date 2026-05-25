/**
 * MyCommuteDashboard.tsx
 * ─────────────────────────────────────────────────────────────────
 * "Refined Transit Intelligence" — Bloomberg Terminal × Apple Maps
 * ─────────────────────────────────────────────────────────────────
 */

import React, { useCallback, useEffect, useState, useMemo, memo } from 'react';
import {
  Animated as RNAnimated,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
  RefreshControl
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  runOnJS,
  useReducedMotion,
  cancelAnimation,
  withSpring
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer } from 'expo-audio';

// ✅ Wired directly to our Zustand + MMKV Brain
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { useShallow } from 'zustand/react/shallow';
import { useTflPoller } from '../hooks/useTflPoller';
import type { StatusLevel } from '../hooks/useWorstStatus';
import { Ionicons } from '@expo/vector-icons';
// ✅ Modal now managed HERE, not upstream
import AddManageModal from '../app/AddManageModal';
import GradientBackground from './GradientBackground';
import DashboardSkeleton from './DashboardSkeleton';
import LivingDot from './LivingDot';
import BouncyButton from './BouncyButton';

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
  }, [severity]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }, animStyle]} />;
});

// ─── Status configuration removed in favor of direct styling in LinePill

const TFL_COLORS: Record<string, string> = {
  bakerloo: '#B36305', central: '#E32017', circle: '#FFD300', district: '#00782A',
  'hammersmith-city': '#F3A9BB', jubilee: '#A0A5A9', metropolitan: '#9B0056',
  northern: '#000000', piccadilly: '#003688', victoria: '#0098D4', 'waterloo-city': '#95CDBA',
  elizabeth: '#6950A1', overground: '#EE7C0E', dlr: '#00A4A7',
};

// ─── SVG Icons ───────────────────────────────────────────────────
const RoundElIcon = () => (
  <View style={iconStyles.roundel}>
    <View style={iconStyles.roundelCircle} />
    <View style={iconStyles.roundelBar} />
  </View>
);

const PinIcon = () => (
  <View style={iconStyles.pin}>
    <View style={iconStyles.pinHead} />
    <View style={iconStyles.pinTail} />
  </View>
);

const iconStyles = StyleSheet.create({
  roundel: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  roundelCircle: { position: 'absolute', width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' },
  roundelBar: { width: 14, height: 2.5, backgroundColor: 'rgba(255,255,255,0.6)' },
  pin: { width: 12, height: 14, alignItems: 'center' },
  pinHead: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)', backgroundColor: 'transparent' },
  pinTail: { width: 2, height: 5, backgroundColor: 'rgba(255,255,255,0.6)', borderBottomLeftRadius: 1, borderBottomRightRadius: 1 },
});

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
  }, [isEditing, reducedMotion]);

  return useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }]
  }));
};

// ─── Press Spring Hook ─────────────────────────
const usePressSpring = () => {
  const scale = useSharedValue(1);
  const reducedMotion = useReducedMotion();
  const player = useAudioPlayer(require('../assets/audio/tap.wav'));

  const onPressIn = React.useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!reducedMotion) {
      scale.value = withSpring(0.96, { damping: 15, stiffness: 300 });
      try {
        if (player) {
          player.volume = 0.5;
          player.play();
        }
      } catch (e) {}
    }
  }, [reducedMotion, scale, player]);

  const onPressOut = React.useCallback(() => {
    if (!reducedMotion) {
      scale.value = withSpring(1.0, { damping: 12, stiffness: 200 });
    }
  }, [reducedMotion, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  return { animStyle, onPressIn, onPressOut };
};

// ─── LinePill ───────────────────────────────────────────────────
const LinePill: React.FC<{ line: LineData; isEditing: boolean; onDelete: (id: string) => void; onLongPress?: () => void; }> = ({ line, isEditing, onDelete, onLongPress }) => {
  const jiggleStyle = useJiggle(isEditing);
  const { animStyle, onPressIn, onPressOut } = usePressSpring();
  const severity = parseSeverity(line.status);
  const statusColor = severity === 'severe' ? '#FF3B30' : severity === 'minor' ? '#FF9500' : severity === 'suspended' ? '#FF3B30' : '#34C759';

  return (
    <Animated.View style={[jiggleStyle, animStyle]}>
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

// ─── StationCard ──────────────────────────────────────────────────
const getDepTimeStyle = (minutes: number | 'now') => {
  if (minutes === 'now') return { color: '#FFFFFF', fontWeight: '700' as const };
  if (minutes <= 3) return { color: '#FF9500', fontWeight: '600' as const };
  return { color: 'rgba(255,255,255,0.75)', fontWeight: '400' as const };
};

const StationCard: React.FC<{ station: StationData; isEditing: boolean; onDelete: (id: string) => void; onLongPress?: () => void; }> = ({ station, isEditing, onDelete, onLongPress }) => {
  const jiggleStyle = useJiggle(isEditing);
  const { animStyle, onPressIn, onPressOut } = usePressSpring();

  return (
    <Animated.View style={[jiggleStyle, animStyle, { marginBottom: 8 }]}>
      <Pressable onPressIn={onPressIn} onPressOut={onPressOut} onLongPress={onLongPress} style={[stCard.container, { marginBottom: 0 }]}>
        <View style={stCard.header}>
          <View style={stCard.uBadge}><Text style={stCard.uText}>U</Text></View>
          <Text style={stCard.stationName} numberOfLines={1}>{String(station.name ?? '').replace(/ Underground Station$/i, '')}</Text>
          {isEditing && (
            <Pressable style={stCard.deleteBadge} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); onDelete(station.id); }}>
              <Text style={stCard.deleteIcon}>−</Text>
            </Pressable>
          )}
        </View>
        {Array.isArray(station.arrivals) && station.arrivals.length > 0 && (
          <View style={stCard.arrivals}>
            {station.arrivals.slice(0, 3).map((a, i) => {
              const depVal = a.minutesAway === 0 ? 'now' : a.minutesAway;
              const depStyle = getDepTimeStyle(depVal);
              return (
                <View key={`arrival-${a.lineId}-${a.destination}-${a.minutesAway}-${(a as any).expectedArrival || 'fallback'}`} style={stCard.arrivalRow}>
                  <View style={[stCard.arrivalDot, { backgroundColor: a.lineColor }]} />
                  <Text style={stCard.arrivalLineName} numberOfLines={1} ellipsizeMode="tail">{a.lineName}</Text>
                  <Text style={stCard.arrivalDest} numberOfLines={1}>{a.destination}</Text>
                  <Text style={[stCard.arrivalTime, depStyle]}>{depVal === 'now' ? 'Due' : `${depVal} min`}</Text>
                </View>
              );
            })}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
};

const stCard = StyleSheet.create({
  container: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 12, overflow: 'visible' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  uBadge: { width: 20, height: 20, borderRadius: 3, backgroundColor: '#003688', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  uText: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 11, color: '#FFF' },
  stationName: { flex: 1, fontFamily: 'SpaceGrotesk-SemiBold', fontSize: 15, color: '#FFFFFF' },
  arrivals: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.1)' },
  arrivalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 8 },
  arrivalDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  arrivalLineName: { width: 72, fontFamily: 'SpaceGrotesk-Regular', fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  arrivalDest: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.9)' },
  arrivalTime: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13, color: '#FFFFFF', textAlign: 'right' },
  deleteBadge: { position: 'absolute', top: -6, left: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#1E1E1E' },
  deleteIcon: { color: '#fff', fontSize: 14, fontWeight: 'bold', marginTop: -2 },
});

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

// ─── Main Dashboard ───────────────────────────────────────────────
export const MyCommuteDashboard: React.FC = () => {
  const insets = useSafeAreaInsets();

  // ✅ Store bindings
  const { resetOnboarding, selectedLines, selectedStations, removeLine, removeStation, setLines, lastKnownData, lastKnownStatus, setLastKnown } = useUserPreferencesStore(useShallow((s: any) => ({
    resetOnboarding: s.resetOnboarding,
    selectedLines: s.selectedLines || [],
    selectedStations: s.pinnedStations || [],
    removeLine: s.toggleLine,
    removeStation: s.unpinStation,
    setLines: s.reorderLines,
    lastKnownData: s.lastKnownData || [],
    lastKnownStatus: s.lastKnownStatus || 'unknown',
    setLastKnown: s.setLastKnown,
  })));

  const [modalVisible, setModalVisible] = useState(false);
  const [data, setData] = useState<DashboardData>({ lines: lastKnownData, stations: [] });
  const [isEditing, setIsEditing] = useState(false);

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

  const myLines = data.lines.filter(l => selectedLines.includes(l.id));
  const myStations = data.stations.filter(s => selectedStations.some((st: any) => st.id === s.id));
  const hasContent = myLines.length > 0 || myStations.length > 0;
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
      <View style={[StyleSheet.absoluteFill, { paddingTop: insets.top }]}>
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

              <BouncyButton onPress={() => setModalVisible(true)} style={dash.primaryBtn}>
                <Text style={dash.primaryBtnTxt}>Add Your First Line</Text>
              </BouncyButton>

              <BouncyButton onPress={() => resetOnboarding()} style={[dash.ghostBtn, { marginTop: 16 }]}>
                <Text style={[dash.ghostBtnTxt, { color: '#ff4444' }]}>Reset Onboarding (Debug)</Text>
              </BouncyButton>
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

          {myStations.length > 0 && (
            <View style={dash.section}>
              <SectionHeader title="MY STATIONS" icon={<Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.35)" />} />
              {myStations.map((station) => (
                <StationCard key={station.id} station={station} isEditing={isEditing} onDelete={removeStation} onLongPress={handleEdit} />
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
      </View>
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
});

export default MyCommuteDashboard;