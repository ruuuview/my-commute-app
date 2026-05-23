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
import * as Haptics from 'expo-haptics';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

// ✅ Wired directly to our Zustand + MMKV Brain
import { useUserPreferencesStore } from '../store/userPreferencesStore';
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
export type Severity = 'severe' | 'minor' | 'good' | 'offline';

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
  if (text.includes('severe') || text.includes('closure') || text.includes('suspended') || text.includes('delay')) return 'severe';
  return 'good';
}

function worstSeverity(lines: LineData[]): Severity {
  if (!lines.length) return 'good';
  const severities = lines.map((l) => parseSeverity(l.status));
  if (severities.includes('severe')) return 'severe';
  if (severities.includes('minor')) return 'minor';
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

// ─── Status pill config ───────────────────────────────────────────
const PILL_CONFIG: Record<Severity, { bg: string; text: string; dot: string; label: (s: string) => string }> = {
  severe: { bg: 'rgba(255,59,48,0.15)', text: '#FF3B30', dot: '#FF3B30', label: (s) => s },
  minor: { bg: 'rgba(255,149,0,0.15)', text: '#FF9500', dot: '#FF9500', label: (s) => s },
  good: { bg: 'rgba(52,199,89,0.15)', text: '#34C759', dot: '#34C759', label: () => 'Good Service' },
  offline: { bg: 'rgba(99,99,102,0.15)', text: '#636366', dot: '#636366', label: () => 'No Data' },
};

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

// ─── StatusPill ───────────────────────────────────────────────────
const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const sev = parseSeverity(status);
  const config = PILL_CONFIG[sev];
  return (
    <View style={[pill.container, { backgroundColor: config.bg }]}>
      <View style={[pill.dot, { backgroundColor: config.dot }]} />
      <Text style={[pill.label, { color: config.text }]} numberOfLines={1}>{config.label(status)}</Text>
    </View>
  );
};

const pill = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, gap: 5, maxWidth: 160 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontFamily: 'SpaceGrotesk-SemiBold', fontSize: 11, letterSpacing: 0.2 },
});

// ─── LineCard (56px) ──────────────────────────────────────────────
const LineCard: React.FC<{ line: LineData; isEditing: boolean; onDelete: (id: string) => void; }> = ({ line, isEditing, onDelete }) => {
  const shakeAnim = React.useRef(new RNAnimated.Value(0)).current;

  React.useEffect(() => {
    if (!isEditing) { shakeAnim.setValue(0); return; }
    const jiggle = RNAnimated.loop(RNAnimated.sequence([
      RNAnimated.timing(shakeAnim, { toValue: 1.5, duration: 80, useNativeDriver: true }), RNAnimated.timing(shakeAnim, { toValue: -1.5, duration: 80, useNativeDriver: true }),
      RNAnimated.timing(shakeAnim, { toValue: 1, duration: 80, useNativeDriver: true }), RNAnimated.timing(shakeAnim, { toValue: -1, duration: 80, useNativeDriver: true }),
      RNAnimated.timing(shakeAnim, { toValue: 0, duration: 80, useNativeDriver: true }), RNAnimated.delay(400),
    ]));
    jiggle.start();
    return () => jiggle.stop();
  }, [isEditing]);

  return (
    <RNAnimated.View style={[card.container, { transform: [{ rotate: shakeAnim.interpolate({ inputRange: [-2, 0, 2], outputRange: ['-2deg', '0deg', '2deg'] }) }] }]}>
      <View style={[card.accent, { backgroundColor: line.color }]} />
      <Text style={card.name} numberOfLines={1}>{line.name}</Text>
      <StatusPill status={line.status} />
      {isEditing && (
        <Pressable style={card.deleteBadge} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); onDelete(line.id); }}>
          <Text style={card.deleteIcon}>−</Text>
        </Pressable>
      )}
    </RNAnimated.View>
  );
};

const card = StyleSheet.create({
  container: { height: 56, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, marginBottom: 8, overflow: 'hidden' },
  accent: { width: 4, height: '100%' },
  name: { flex: 1, marginLeft: 14, fontFamily: 'SpaceGrotesk-SemiBold', fontSize: 15, color: '#FFFFFF', letterSpacing: 0.1 },
  deleteBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center', marginRight: 14, marginLeft: 8 },
  deleteIcon: { color: '#fff', fontSize: 16, fontWeight: '700', lineHeight: 20 },
});

// ─── StationCard ──────────────────────────────────────────────────
const StationCard: React.FC<{ station: StationData; isEditing: boolean; onDelete: (id: string) => void; }> = ({ station, isEditing, onDelete }) => {
  const shakeAnim = React.useRef(new RNAnimated.Value(0)).current;

  React.useEffect(() => {
    if (!isEditing) { shakeAnim.setValue(0); return; }
    const jiggle = RNAnimated.loop(RNAnimated.sequence([
      RNAnimated.timing(shakeAnim, { toValue: 1.5, duration: 80, useNativeDriver: true }), RNAnimated.timing(shakeAnim, { toValue: -1.5, duration: 80, useNativeDriver: true }),
      RNAnimated.timing(shakeAnim, { toValue: 0, duration: 80, useNativeDriver: true }), RNAnimated.delay(500),
    ]));
    jiggle.start();
    return () => jiggle.stop();
  }, [isEditing]);

  return (
    <RNAnimated.View style={[stCard.container, { transform: [{ rotate: shakeAnim.interpolate({ inputRange: [-2, 0, 2], outputRange: ['-2deg', '0deg', '2deg'] }) }] }]}>
      <View style={stCard.header}>
        <View style={stCard.uBadge}><Text style={stCard.uText}>U</Text></View>
        <Text style={stCard.stationName} numberOfLines={1}>{String(station.name ?? '').replace(/ Underground Station$/i, '')}</Text>
        {isEditing && (
          <Pressable style={card.deleteBadge} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); onDelete(station.id); }}>
            <Text style={card.deleteIcon}>−</Text>
          </Pressable>
        )}
      </View>
      {Array.isArray(station.arrivals) && station.arrivals.length > 0 && (
        <View style={stCard.arrivals}>
          {station.arrivals.slice(0, 3).map((a, i) => (
            <View key={`arrival-${a.lineId}-${a.destination}-${a.minutesAway}-${(a as any).expectedArrival || 'fallback'}`} style={stCard.arrivalRow}>
              <View style={[stCard.arrivalDot, { backgroundColor: a.lineColor }]} />
              <Text style={stCard.arrivalLineName} numberOfLines={1} ellipsizeMode="tail">{a.lineName}</Text>
              <Text style={stCard.arrivalDest} numberOfLines={1}>{a.destination}</Text>
              <Text style={stCard.arrivalTime}>{a.minutesAway === 0 ? 'Due' : `${a.minutesAway} min`}</Text>
            </View>
          ))}
        </View>
      )}
    </RNAnimated.View>
  );
};

const stCard = StyleSheet.create({
  container: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 12, overflow: 'hidden' },
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
});

// ─── Section header ───────────────────────────────────────────────
const SectionHeader: React.FC<{ title: string; icon: React.ReactNode }> = ({ title, icon }) => (
  <View style={section.row}>
    {icon}
    <Text style={section.title}>{title}</Text>
  </View>
);
const section = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10, marginTop: 4 },
  title: { fontFamily: 'SpaceGrotesk-SemiBold', fontSize: 12, letterSpacing: 1.1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' },
});

// ─── Main Dashboard ───────────────────────────────────────────────
export const MyCommuteDashboard: React.FC = () => {
  const insets = useSafeAreaInsets();

  // ✅ Modal state lives HERE now
  const resetOnboarding = useUserPreferencesStore((state: any) => state.resetOnboarding);

  const [modalVisible, setModalVisible] = useState(false);

  // ✅ Live Data Hook
  const [data, setData] = useState<DashboardData>({ lines: [], stations: [] });
  const [refreshing, setRefreshing] = useState(false);

  // ✅ Zustand selectors
  const selectedLines = useUserPreferencesStore((s: any) => s.selectedLines || []);
  const selectedStations = useUserPreferencesStore((s: any) => s.pinnedStations || []);
  const removeLine = useUserPreferencesStore((s: any) => s.toggleLine);
  const removeStation = useUserPreferencesStore((s: any) => s.unpinStation);
  const setLines = useUserPreferencesStore((s: any) => s.reorderLines);

  const [isEditing, setIsEditing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('https://my-commute-backend.vercel.app/api/lines');
      const raw = await response.json();

      const fresh: DashboardData = {
        lines: raw.map((item: any) => ({
          id: String(item?.id ?? ''),
          name: String(item?.name ?? ''),
          color: TFL_COLORS[String(item?.id ?? '')] || '#888',
          status: String(item?.status ?? ''),
        })),
        stations: data.stations || [],
      };
      setData(fresh);
    } catch (err) { console.log('Fetch error'); }
  }, [data.stations]);

  useEffect(() => { fetchData(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

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
  const myStations = data.stations.filter(s => selectedStations.includes(s.id));
  const hasContent = myLines.length > 0 || myStations.length > 0;
  const networkSeverity = useMemo(() => worstSeverity(myLines), [myLines]);

  return (
    <View style={dash.root}>
      <GradientBackground lines={selectedLines} />
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
        </View>

        {/* ── Content ── */}
        <ScrollView
          style={dash.scroll}
          contentContainerStyle={[dash.scrollContent, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="rgba(255,255,255,0.6)" />}
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

          {myLines.length > 0 && (
            <View style={dash.section}>
              <SectionHeader title="Lines" icon={<RoundElIcon />} />
              {myLines.map((line) => (
                <LineCard key={line.id} line={line} isEditing={isEditing} onDelete={removeLine} />
              ))}
            </View>
          )}

          {myStations.length > 0 && (
            <View style={dash.section}>
              <SectionHeader title="Stations" icon={<PinIcon />} />
              {myStations.map((station) => (
                <StationCard key={station.id} station={station} isEditing={isEditing} onDelete={removeStation} />
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