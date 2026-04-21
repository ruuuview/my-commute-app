import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  memo,
} from 'react';
import {
  Dimensions,
  LayoutAnimation,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
  RefreshControl,
  AccessibilityInfo,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { GestureHandlerRootView, PanGestureHandler } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MMKV } from 'react-native-mmkv';

// ─── Enable LayoutAnimation on Android ──────────────────────────────────────
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── MMKV Storage ───────────────────────────────────────────────────────────
let _storage: MMKV | null = null;
function getStorage(): MMKV | null {
  if (!_storage) {
    try {
      _storage = new MMKV();
    } catch (e) {
      console.warn('MMKV not ready:', e);
      return null;
    }
  }
  return _storage;
}
const CACHE_KEY = 'tfl_dashboard_cache';
const CACHE_TIMESTAMP_KEY = 'tfl_dashboard_timestamp';
const STALE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

// ─── Types ───────────────────────────────────────────────────────────────────
type StatusSeverity = 'good' | 'minor' | 'severe' | 'part_closure' | 'suspended' | 'special' | 'unknown';
type BannerType = 'stale' | 'offline' | 'error' | null;

interface TflLine {
  id: string;
  name: string;
  severity: StatusSeverity;
  statusText: string;
  disruption?: string;
}

interface Arrival {
  lineId: string;
  lineName: string;
  destination: string;
  minutesUntil: number;
  platform?: string;
}

interface TflStation {
  id: string;
  name: string;
  arrivals: Arrival[];
}

interface DashboardData {
  lines: TflLine[];
  stations: TflStation[];
}

// ─── Constants ───────────────────────────────────────────────────────────────
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const H_PAD = 20;
const CARD_GAP = 12;
const GRID_CARD_WIDTH = (SCREEN_WIDTH - H_PAD * 2 - CARD_GAP) / 2;

// ─── Utils ───────────────────────────────────────────────────────────────────
function getStatusColor(severity: StatusSeverity): string {
  switch (severity) {
    case 'good':         return '#34C759';
    case 'minor':        return '#FF9500';
    case 'severe':
    case 'part_closure':
    case 'suspended':    return '#FF3B30';
    case 'special':      return '#007AFF';
    case 'unknown':
    default:             return '#8E8E93';
  }
}

function getLineColor(lineId: string): string {
  const colors: Record<string, string> = {
    bakerloo:        '#B36305',
    central:         '#E32017',
    circle:          '#FFD300',
    district:        '#00782A',
    'hammersmith-city': '#F3A9BB',
    jubilee:         '#A0A5A9',
    metropolitan:    '#9B0056',
    northern:        '#000000',
    piccadilly:      '#003688',
    victoria:        '#0098D4',
    'waterloo-city': '#95CDBA',
    elizabeth:       '#6950A1',
    dlr:             '#00A4A7',
    overground:      '#EE7C0E',
  };
  return colors[lineId] ?? '#8E8E93';
}

function stripStationName(raw: string): string {
  return raw
    .replace(/ Underground Station$/i, '')
    .replace(/ London Underground Station$/i, '')
    .replace(/ Rail Station$/i, '')
    .replace(/ Station$/i, '')
    .trim();
}

function stripDestination(raw: string): string {
  return raw
    .replace(/ Underground Station$/i, '')
    .replace(/ Station$/i, '')
    .trim();
}

function getWorstSeverity(lines: TflLine[]): StatusSeverity {
  if (lines.some(l => ['severe', 'part_closure', 'suspended'].includes(l.severity))) return 'severe';
  if (lines.some(l => l.severity === 'minor')) return 'minor';
  if (lines.some(l => l.severity === 'special')) return 'special';
  if (lines.every(l => l.severity === 'good')) return 'good';
  return 'unknown';
}

function getGradientColors(severity: StatusSeverity): [string, string] {
  switch (severity) {
    case 'severe':       return ['rgba(255,59,48,0.92)',  'rgba(255,255,255,0.03)'];
    case 'minor':        return ['rgba(255,149,0,0.88)',  'rgba(255,255,255,0.03)'];
    case 'good':         return ['rgba(52,199,89,0.82)',  'rgba(255,255,255,0.03)'];
    default:             return ['#1C1C2E',               '#0A0A0A'];
  }
}

// ─── Mock data (replace with real TfL API fetch) ────────────────────────────
const MOCK_DATA: DashboardData = {
  lines: [
    { id: 'jubilee',   name: 'Jubilee',   severity: 'severe', statusText: 'Severe delays', disruption: 'Signal failure at London Bridge causing major disruption.' },
    { id: 'district',  name: 'District',  severity: 'minor',  statusText: 'Minor delays',  disruption: 'Congestion between Victoria and Sloane Square.' },
    { id: 'central',   name: 'Central',   severity: 'good',   statusText: 'Good service' },
    { id: 'victoria',  name: 'Victoria',  severity: 'good',   statusText: 'Good service' },
    { id: 'northern',  name: 'Northern',  severity: 'good',   statusText: 'Good service' },
  ],
  stations: [
    {
      id: 'oxford-circus',
      name: 'Oxford Circus Underground Station',
      arrivals: [
        { lineId: 'central',  lineName: 'Central',  destination: 'Ealing Broadway', minutesUntil: 0,  platform: '1' },
        { lineId: 'victoria', lineName: 'Victoria', destination: 'Brixton',         minutesUntil: 2,  platform: '3' },
        { lineId: 'central',  lineName: 'Central',  destination: 'Hainault',        minutesUntil: 5,  platform: '2' },
      ],
    },
  ],
};

// ─── FractalGlassBackground ──────────────────────────────────────────────────
interface FractalGlassBackgroundProps {
  worstSeverity: StatusSeverity;
  isOffline: boolean;
}

const FractalGlassBackground = memo(({ worstSeverity, isOffline }: FractalGlassBackgroundProps) => {
  const effectiveSeverity = isOffline ? 'unknown' : worstSeverity;
  const [colors, setColors] = useState<[string, string]>(getGradientColors(effectiveSeverity));
  const [prevColors, setPrevColors] = useState<[string, string]>(getGradientColors(effectiveSeverity));
  const fadeAnim = useSharedValue(0);

  useEffect(() => {
    const next = getGradientColors(effectiveSeverity);
    if (next[0] !== colors[0]) {
      setPrevColors(colors);
      setColors(next);
      fadeAnim.value = 0;
      fadeAnim.value = withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) });
    }
  }, [effectiveSeverity]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: fadeAnim.value }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient colors={prevColors} locations={[0, 0.55]} style={StyleSheet.absoluteFill} />
      <Animated.View style={[StyleSheet.absoluteFill, overlayStyle]}>
        <LinearGradient colors={colors} locations={[0, 0.55]} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
});

// ─── AppWordmark ─────────────────────────────────────────────────────────────
interface AppWordmarkProps {
  worstSeverity: StatusSeverity;
  onRefreshComplete?: boolean;
}

const AppWordmark = memo(({ worstSeverity, onRefreshComplete }: AppWordmarkProps) => {
  const scale = useSharedValue(1);
  const rotation = useSharedValue(0);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.0,  { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);

  useEffect(() => {
    if (onRefreshComplete) {
      rotation.value = withTiming(360, { duration: 600, easing: Easing.inOut(Easing.ease) }, () => {
        rotation.value = 0;
      });
    }
  }, [onRefreshComplete]);

  const markStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotation.value}deg` }],
  }));

  const statusColor = getStatusColor(worstSeverity);

  return (
    <View style={styles.wordmarkRow}>
      <View>
        <Text style={styles.wordmarkMy} allowFontScaling maxFontSizeMultiplier={1.2}>MY</Text>
        <View style={styles.wordmarkCommRow}>
          <Text style={styles.wordmarkCommute} allowFontScaling maxFontSizeMultiplier={1.2}>COMMUTE</Text>
          <View style={styles.proPill}>
            <Text style={styles.proPillText}>Pro</Text>
          </View>
        </View>
      </View>

      <Animated.View style={[styles.markOuter, markStyle]}>
        <View style={[styles.markInner, { borderColor: statusColor }]}>
          <View style={[styles.markDot, { backgroundColor: statusColor }]} />
        </View>
      </Animated.View>
    </View>
  );
});

// ─── LivingDot ───────────────────────────────────────────────────────────────
interface LivingDotProps {
  severity: StatusSeverity;
  isStale: boolean;
}

const LivingDot = memo(({ severity, isStale }: LivingDotProps) => {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(isStale ? 0.45 : 1);

  useEffect(() => {
    opacity.value = withTiming(isStale ? 0.45 : 1, { duration: 400 });

    if (isStale) {
      scale.value = withTiming(1, { duration: 400 });
      return;
    }

    const duration = severity === 'severe' ? 900 : severity === 'minor' ? 1600 : 2400;
    const maxScale  = severity === 'severe' ? 1.3 : 1.25;

    scale.value = withRepeat(
      withSequence(
        withTiming(maxScale, { duration: duration / 2, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.0,      { duration: duration / 2, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [severity, isStale]);

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[styles.livingDot, { backgroundColor: getStatusColor(severity) }, dotStyle]}
      accessibilityElementsHidden
    />
  );
});

// ─── TrafficLightLoader ──────────────────────────────────────────────────────
interface TrafficLightLoaderProps {
  visible: boolean;
  onComplete?: () => void;
}

const TrafficLightLoader = memo(({ visible, onComplete }: TrafficLightLoaderProps) => {
  const redOp    = useSharedValue(1);
  const amberOp  = useSharedValue(0.15);
  const greenOp  = useSharedValue(0.15);
  const greenSc  = useSharedValue(1);
  const containerOp = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    if (!visible) {
      containerOp.value = withTiming(0, { duration: 300 });
      return;
    }

    containerOp.value = withTiming(1, { duration: 200 });
    const startTime = Date.now();
    const MIN_DISPLAY = 800;

    const cycle = () => {
      redOp.value   = withTiming(1,    { duration: 100 });
      amberOp.value = withTiming(0.15, { duration: 100 });
      greenOp.value = withTiming(0.15, { duration: 100 });

      setTimeout(() => {
        redOp.value   = withTiming(0.15, { duration: 100 });
        amberOp.value = withTiming(1,    { duration: 100 });
      }, 200);

      setTimeout(() => {
        amberOp.value = withTiming(0.15, { duration: 100 });
        greenOp.value = withTiming(1,    { duration: 100 });

        setTimeout(() => {
          const elapsed = Date.now() - startTime;
          const remaining = Math.max(0, MIN_DISPLAY - elapsed);

          setTimeout(() => {
            greenSc.value = withSequence(
              withTiming(1.3, { duration: 200 }),
              withTiming(1.0, { duration: 200 }),
            );
            containerOp.value = withTiming(0, { duration: 400 }, () => {
              if (onComplete) runOnJS(onComplete)();
            });
          }, remaining);
        }, 100);
      }, 400);
    };

    cycle();
  }, [visible]);

  const rStyle = useAnimatedStyle(() => ({ opacity: redOp.value }));
  const aStyle = useAnimatedStyle(() => ({ opacity: amberOp.value }));
  const gStyle = useAnimatedStyle(() => ({ opacity: greenOp.value, transform: [{ scale: greenSc.value }] }));
  const containerStyle = useAnimatedStyle(() => ({ opacity: containerOp.value }));

  return (
    <Animated.View
      style={[styles.trafficContainer, containerStyle]}
      accessibilityLabel="Checking live status"
      accessibilityRole="progressbar"
    >
      <Animated.View style={[styles.trafficDot, { backgroundColor: '#FF3B30' }, rStyle]} />
      <Animated.View style={[styles.trafficDot, { backgroundColor: '#FF9500' }, aStyle]} />
      <Animated.View style={[styles.trafficDot, { backgroundColor: '#34C759' }, gStyle]} />
    </Animated.View>
  );
});

// ─── StatusBanner ─────────────────────────────────────────────────────────────
interface StatusBannerProps {
  type: BannerType;
  lastUpdated?: Date;
  onDismiss: () => void;
}

const StatusBanner = memo(({ type, lastUpdated, onDismiss }: StatusBannerProps) => {
  const translateY = useSharedValue(-60);
  const opacity    = useSharedValue(0);

  useEffect(() => {
    if (type) {
      translateY.value = withTiming(0,  { duration: 300, easing: Easing.out(Easing.ease) });
      opacity.value    = withTiming(1,  { duration: 300 });

      if (type === 'error') {
        setTimeout(() => {
          translateY.value = withTiming(-60, { duration: 300 });
          opacity.value    = withTiming(0,   { duration: 300 }, () => runOnJS(onDismiss)());
        }, 5000);
      }
    } else {
      translateY.value = withTiming(-60, { duration: 300 });
      opacity.value    = withTiming(0,   { duration: 300 });
    }
  }, [type]);

  const bannerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!type) return null;

  const accentColor =
    type === 'error'  ? '#FF3B30' :
    type === 'stale'  ? '#FF9500' : '#8E8E93';

  const timeStr = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const message =
    type === 'stale'   ? `Data may be outdated · Last updated ${timeStr}` :
    type === 'offline' ? `Offline · Last updated ${timeStr}` :
                         "Couldn't reach TfL · Showing last known data";

  return (
    <Animated.View style={[styles.bannerWrapper, bannerStyle]} accessibilityLiveRegion="polite">
      <View style={[styles.bannerPill, { borderLeftColor: accentColor }]}>
        <View style={[styles.bannerAccent, { backgroundColor: accentColor }]} />
        <Text style={styles.bannerText}>{message}</Text>
      </View>
    </Animated.View>
  );
});

// ─── BouncyButton ─────────────────────────────────────────────────────────────
interface BouncyButtonProps {
  onPress: () => void;
  children: React.ReactNode;
  style?: object;
  accessibilityLabel?: string;
}

const BouncyButton = ({ onPress, children, style, accessibilityLabel }: BouncyButtonProps) => {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePressIn = () => scale.value = withSpring(0.97, { damping: 15, stiffness: 150, mass: 0.8 });
  const handlePressOut = () => scale.value = withSpring(1.0,  { damping: 15, stiffness: 150, mass: 0.8 });

  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[{ minHeight: 44, minWidth: 44, justifyContent: 'center' }, style]}
        accessibilityLabel={accessibilityLabel}
        activeOpacity={1}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
};

// ─── SkeletonCard ─────────────────────────────────────────────────────────────
const SkeletonCard = memo(() => {
  const shimmer = useSharedValue(-1);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
  }, []);

  const shimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmer.value * SCREEN_WIDTH }],
  }));

  return (
    <View style={styles.skeletonCard}>
      <Animated.View style={[styles.skeletonShimmer, shimStyle]} />
      <View style={styles.skeletonBar} />
      <View style={[styles.skeletonBar, { width: '60%', marginTop: 8 }]} />
    </View>
  );
});

// ─── LineCard ─────────────────────────────────────────────────────────────────
interface LineCardProps {
  line: TflLine;
  isCompact: boolean;
  isStale: boolean;
}

const LineCard = memo(({ line, isCompact, isStale }: LineCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const chevronRotation = useSharedValue(0);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (line.disruption) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
      setExpanded(e => !e);
      chevronRotation.value = withTiming(expanded ? 0 : 180, { duration: 250 });
    }
  };

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value}deg` }],
  }));

  const cardWidth = isCompact ? GRID_CARD_WIDTH : '100%' as any;

  return (
    <BouncyButton onPress={handlePress} style={{ width: cardWidth }}>
      <View style={[styles.lineCard, { width: cardWidth }]}>
        <View style={[styles.accentBar, { backgroundColor: getLineColor(line.id) }]} />
        <View style={styles.lineCardInner}>
          <View style={styles.lineCardLeft}>
            <Text style={styles.lineName} allowFontScaling maxFontSizeMultiplier={1.4} numberOfLines={1}>{line.name}</Text>
            <Text style={[styles.lineStatus, { color: getStatusColor(line.severity) }]} allowFontScaling maxFontSizeMultiplier={1.3} numberOfLines={1}>{line.statusText}</Text>
            {line.disruption && !expanded && (
              <Text style={styles.disruptionPreview} numberOfLines={1} ellipsizeMode="tail" allowFontScaling>{line.disruption}</Text>
            )}
            {expanded && line.disruption && (
              <Text style={styles.disruptionFull} allowFontScaling>{line.disruption}</Text>
            )}
          </View>
          <View style={styles.lineCardRight}>
            <LivingDot severity={line.severity} isStale={isStale} />
            {line.disruption && <Animated.Text style={[styles.chevron, chevronStyle]}>›</Animated.Text>}
          </View>
        </View>
      </View>
    </BouncyButton>
  );
});

// ─── StationCard ──────────────────────────────────────────────────────────────
interface StationCardProps {
  station: TflStation;
}

const StationCard = memo(({ station }: StationCardProps) => {
  const cleanName = stripStationName(station.name);
  const arrivals  = station.arrivals.slice(0, 3);

  const handlePress = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

  return (
    <BouncyButton onPress={handlePress} style={styles.stationCardWrapper}>
      <View style={styles.stationCard}>
        <View style={styles.stationHeader}>
          <View style={styles.trainIcon}>
            <View style={styles.trainBody} />
            <View style={styles.trainWindow} />
          </View>
          <Text style={styles.stationName} allowFontScaling maxFontSizeMultiplier={1.4} numberOfLines={1}>{cleanName}</Text>
        </View>

        {arrivals.map((arrival, idx) => {
          const isNow    = arrival.minutesUntil === 0;
          const isUrgent = arrival.minutesUntil > 0 && arrival.minutesUntil <= 2;
          const timeColor = isNow ? '#FFFFFF' : isUrgent ? '#FF9500' : '#FFFFFF';
          const timeText  = isNow ? 'Now' : `${arrival.minutesUntil} min`;

          return (
            <View key={idx} style={styles.arrivalRow}>
              <Text style={[styles.arrivalLine, { color: getLineColor(arrival.lineId) }]} numberOfLines={1} allowFontScaling maxFontSizeMultiplier={1.2}>
                {arrival.lineName.toUpperCase()}
              </Text>
              <Text style={styles.arrivalDest} numberOfLines={1} ellipsizeMode="tail" allowFontScaling maxFontSizeMultiplier={1.2}>
                {stripDestination(arrival.destination)}
              </Text>
              <Text style={[styles.arrivalTime, { color: timeColor }]} allowFontScaling maxFontSizeMultiplier={1.3}>
                {timeText}
              </Text>
            </View>
          );
        })}

        {arrivals.length === 0 && <Text style={styles.noArrivals}>No arrivals found</Text>}
      </View>
    </BouncyButton>
  );
});

// ─── StatusHero ───────────────────────────────────────────────────────────────
interface StatusHeroProps {
  lines: TflLine[];
}

const StatusHero = memo(({ lines }: StatusHeroProps) => {
  const disrupted = lines.filter(l => l.severity !== 'good' && l.severity !== 'unknown');
  const summaryText = disrupted.length === 0 ? 'All clear' : disrupted.length === 1 ? '1 line disrupted' : `${disrupted.length} lines disrupted`;
  const subText = disrupted.map(l => l.name).join(' · ');

  return (
    <View style={styles.statusHero}>
      <Text style={styles.heroEyebrow} allowFontScaling maxFontSizeMultiplier={1.2}>STATUS</Text>
      <Text style={styles.heroSummary}  allowFontScaling maxFontSizeMultiplier={1.4}>{summaryText}</Text>
      {subText ? <Text style={styles.heroSub} allowFontScaling maxFontSizeMultiplier={1.3}>{subText}</Text> : null}
    </View>
  );
});

// ─── EmptyState ───────────────────────────────────────────────────────────────
interface EmptyStateProps {
  hasLines: boolean;
  onAddLines: () => void;
  onAddStation: () => void;
}

const EmptyState = ({ hasLines, onAddLines, onAddStation }: EmptyStateProps) => {
  if (!hasLines) {
    return (
      <View style={styles.emptyFull}>
        <View style={styles.roundel}><View style={styles.roundelBar} /></View>
        <Text style={styles.emptyTitle}>Your commute starts here</Text>
        <Text style={styles.emptySub}>Add your lines and stations to see live status and arrivals.</Text>
        <BouncyButton onPress={onAddLines} style={styles.emptyButton}>
          <Text style={styles.emptyButtonText}>+ Add Lines & Stations</Text>
        </BouncyButton>
      </View>
    );
  }

  return (
    <View style={styles.emptyPartial}>
      <View style={styles.stationIcon} />
      <Text style={styles.emptyTitle}>Add a station</Text>
      <Text style={styles.emptySub}>See live departures for your regular stops.</Text>
      <BouncyButton onPress={onAddStation} style={styles.emptyButton}>
        <Text style={styles.emptyButtonText}>+ Add Station</Text>
      </BouncyButton>
    </View>
  );
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function MyCommuteDashboard() {
  const insets = useSafeAreaInsets();

  const [data, setData]               = useState<DashboardData | null>(null);
  const [refreshing, setRefreshing]   = useState(false);
  const [loading, setLoading]         = useState(true);
  const [isStale, setIsStale]         = useState(false);
  const [isOffline, setIsOffline]     = useState(false);
  const [bannerType, setBannerType]   = useState<BannerType>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>();
  const [refreshComplete, setRefreshComplete] = useState(false);

  const loadCachedData = useCallback(() => {
    try {
      const storage = getStorage();
      if (!storage) return; // Guard
      const cached = storage.getString(CACHE_KEY);
      const ts     = storage.getNumber(CACHE_TIMESTAMP_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as DashboardData;
        setData(parsed);
        if (ts) {
          const age = Date.now() - ts;
          setIsStale(age > STALE_THRESHOLD_MS);
          setLastUpdated(new Date(ts));
          if (age > STALE_THRESHOLD_MS) setBannerType('stale');
        }
      }
    } catch (_) {}
  }, []);

  const fetchData = useCallback(async () => {
    try {
      // TODO: Replace with real TfL API call later
      await new Promise(r => setTimeout(r, 1200));
      const fresh = MOCK_DATA; // Temporary for UI testing

      // 1. SET STATE FIRST (Fixes the black screen!)
      setData(fresh);
      setIsStale(false);
      setIsOffline(false);
      setBannerType(null);
      setLastUpdated(new Date());
      setRefreshComplete(true);
      setTimeout(() => setRefreshComplete(false), 800);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // 2. DO STORAGE LAST
      const storage = getStorage();
      if (storage) { // Guard
        storage.set(CACHE_KEY, JSON.stringify(fresh));
        storage.set(CACHE_TIMESTAMP_KEY, Date.now());
      }
    } catch (_) {
      // 3. NO MORE LIES. If MMKV/Network fails, show the error state.
      setIsOffline(true);
      setBannerType(isStale ? 'error' : 'offline');
      
      // Failsafe: ensure `data` is an empty object, NOT null, so the UI doesn't black-screen
      setData(prev => prev || { lines: [], stations: [] }); 
    }
  }, [isStale]);

  useEffect(() => {
    loadCachedData();
    fetchData().finally(() => setLoading(false));

    const interval = setInterval(() => {
      const storage = getStorage();
      if (!storage) return; // Guard
      const ts = storage.getNumber(CACHE_TIMESTAMP_KEY);
      if (ts && Date.now() - ts > STALE_THRESHOLD_MS) {
        setIsStale(true);
        setBannerType('stale');
      }
    }, 30_000);

    return () => clearInterval(interval);
  }, [loadCachedData, fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const worstSeverity = data ? getWorstSeverity(data.lines) : 'unknown';
  const disruptedLines = data?.lines.filter(l => l.severity !== 'good') ?? [];
  const goodLines      = data?.lines.filter(l => l.severity === 'good')  ?? [];
  const hasOddGoodLine = goodLines.length % 2 !== 0;

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar barStyle="light-content" />

      <FractalGlassBackground worstSeverity={worstSeverity} isOffline={isOffline} />

      <StatusBanner
        type={bannerType}
        lastUpdated={lastUpdated}
        onDismiss={() => setBannerType(null)}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="rgba(255,255,255,0.6)"
          />
        }
      >
        <View style={styles.header}>
          <AppWordmark
            worstSeverity={worstSeverity}
            onRefreshComplete={refreshComplete}
          />
          <TrafficLightLoader visible={loading || refreshing} />
        </View>

        {loading && !data && (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <View style={{ height: 12 }} />
            <SkeletonCard />
          </>
        )}

        {data && (
          <>
            {data.lines.length > 0 && <StatusHero lines={data.lines} />}

            {data.lines.length > 0 && (
              <>
                <Text style={styles.sectionHeader}>MY LINES</Text>

                {[...disruptedLines]
                  .sort((a, b) => {
                    const order: Record<StatusSeverity, number> = {
                      suspended: 0, part_closure: 0, severe: 0, minor: 1, special: 2, good: 3, unknown: 4,
                    };
                    return order[a.severity] - order[b.severity];
                  })
                  .map(line => (
                    <LineCard key={line.id} line={line} isCompact={false} isStale={isStale} />
                  ))
                }

                {disruptedLines.length > 0 && goodLines.length > 0 && (
                  <Text style={styles.sectionHeader}>GOOD SERVICE</Text>
                )}

                {goodLines.length > 0 && (
                  <View style={styles.goodGrid}>
                    {goodLines.map((line, i) => {
                      const isLast = i === goodLines.length - 1;
                      const isOrphan = isLast && hasOddGoodLine;
                      return (
                        <LineCard
                          key={line.id}
                          line={line}
                          isCompact={!isOrphan}
                          isStale={isStale}
                        />
                      );
                    })}
                  </View>
                )}

                <BouncyButton onPress={() => {}} style={styles.addButton}>
                  <BlurView intensity={20} tint="dark" style={styles.addButtonBlur}>
                    <Text style={styles.addButtonText}>+ Add Line</Text>
                  </BlurView>
                </BouncyButton>
              </>
            )}

            {data.stations.length > 0 || data.lines.length > 0 ? (
              <Text style={styles.sectionHeader}>MY STATIONS</Text>
            ) : null}

            {data.stations.length === 0 && data.lines.length > 0 ? (
              <EmptyState
                hasLines={true}
                onAddLines={() => {}}
                onAddStation={() => {}}
              />
            ) : data.stations.length > 0 ? (
              <>
                {data.stations.map(station => (
                  <StationCard key={station.id} station={station} />
                ))}

                <BouncyButton onPress={() => {}} style={styles.addButton}>
                  <BlurView intensity={20} tint="dark" style={styles.addButtonBlur}>
                    <Text style={styles.addButtonText}>+ Add Station</Text>
                  </BlurView>
                </BouncyButton>
              </>
            ) : null}
          </>
        )}

        {!loading && data && data.lines.length === 0 && data.stations.length === 0 && (
          <EmptyState
            hasLines={false}
            onAddLines={() => {}}
            onAddStation={() => {}}
          />
        )}
      </ScrollView>
    </GestureHandlerRootView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0A' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: H_PAD },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  wordmarkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  wordmarkMy: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 13, letterSpacing: 3, color: 'rgba(255,255,255,0.85)', lineHeight: 14 },
  wordmarkCommRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  wordmarkCommute: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 22, letterSpacing: 1, color: '#FFFFFF', lineHeight: 26 },
  proPill: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  proPillText: { fontFamily: 'SpaceGrotesk-SemiBold', fontSize: 10, color: '#FFFFFF' },

  markOuter: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  markInner: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  markDot: { width: 5, height: 5, borderRadius: 2.5 },

  trafficContainer: { backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 22, paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center', gap: 6, height: 52, justifyContent: 'center' },
  trafficDot: { width: 10, height: 10, borderRadius: 5 },

  bannerWrapper: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, alignItems: 'center', paddingTop: 60, paddingHorizontal: H_PAD },
  bannerPill: { backgroundColor: 'rgba(0,0,0,0.60)', borderRadius: 22, paddingHorizontal: 20, paddingVertical: 10, maxWidth: '85%', flexDirection: 'row', alignItems: 'center', borderLeftWidth: 4, gap: 10 },
  bannerAccent: { width: 0, height: 0 },
  bannerText: { fontSize: 13, color: '#FFFFFF', fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif' },

  statusHero: { paddingVertical: 8, marginBottom: 4 },
  heroEyebrow: { fontSize: 10, letterSpacing: 2, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', marginBottom: 4 },
  heroSummary: { fontSize: 17, fontWeight: '600', color: '#FFFFFF', marginBottom: 2 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)' },

  sectionHeader: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 12, letterSpacing: 3, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginTop: 28, marginBottom: 10 },

  lineCard: { backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 16, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.08)', marginBottom: CARD_GAP, minHeight: 72, overflow: 'hidden', ...Platform.select({ ios: { shouldRasterizeIOS: true } as any }) },
  accentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderRadius: 0 },
  lineCardInner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 20, paddingRight: 16, paddingVertical: 14 },
  lineCardLeft: { flex: 1, paddingRight: 12 },
  lineCardRight: { alignItems: 'center', gap: 6 },
  lineName: { fontFamily: 'SpaceGrotesk-SemiBold', fontSize: 17, letterSpacing: -0.3, color: '#FFFFFF', marginBottom: 2 },
  lineStatus: { fontSize: 14, color: '#FFFFFF', marginBottom: 2 },
  disruptionPreview: { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  disruptionFull: { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 4, lineHeight: 18 },
  chevron: { fontSize: 18, color: 'rgba(255,255,255,0.4)', marginTop: 2 },

  livingDot: { width: 12, height: 12, borderRadius: 6 },

  goodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP },

  stationCardWrapper: { width: '100%', marginBottom: CARD_GAP },
  stationCard: { backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 16, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 16, paddingVertical: 14 },
  stationHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  trainIcon: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  trainBody: { width: 14, height: 10, backgroundColor: '#007AFF', borderRadius: 2 },
  trainWindow: { position: 'absolute', top: 2, left: 3, width: 4, height: 4, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 1 },
  stationName: { fontFamily: 'SpaceGrotesk-SemiBold', fontSize: 17, color: '#FFFFFF', flex: 1 },

  arrivalRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.07)', paddingVertical: 10 },
  arrivalLine: { width: 56, fontSize: 11, fontWeight: '600' },
  arrivalDest: { flex: 1, fontSize: 14, color: 'rgba(255,255,255,0.82)', paddingHorizontal: 4 },
  arrivalTime: { width: 52, fontSize: 15, fontFamily: 'SpaceGrotesk-Bold', textAlign: 'right' },
  noArrivals: { fontSize: 13, color: 'rgba(255,255,255,0.4)', paddingTop: 8 },

  addButton: { marginBottom: CARD_GAP, borderRadius: 14, overflow: 'hidden' },
  addButtonBlur: { paddingVertical: 14, alignItems: 'center', borderRadius: 14, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.12)' },
  addButtonText: { fontSize: 15, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },

  skeletonCard: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, height: 80, marginBottom: CARD_GAP, overflow: 'hidden', padding: 16, justifyContent: 'center' },
  skeletonShimmer: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.10)' },
  skeletonBar: { height: 12, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 6, width: '40%', marginBottom: 4 },

  emptyFull: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyPartial: { alignItems: 'center', paddingTop: 32, gap: 10 },
  roundel: { width: 48, height: 48, borderRadius: 24, borderWidth: 5, borderColor: '#E32017', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  roundelBar: { width: 48, height: 8, backgroundColor: '#003688', position: 'absolute' },
  stationIcon: { width: 32, height: 32, backgroundColor: '#007AFF', borderRadius: 8, marginBottom: 4 },
  emptyTitle: { fontSize: 22, fontWeight: '600', color: '#FFFFFF', textAlign: 'center' },
  emptySub: { fontSize: 15, color: 'rgba(255,255,255,0.6)', textAlign: 'center', paddingHorizontal: 24, lineHeight: 21 },
  emptyButton: { backgroundColor: '#000000', borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14, marginTop: 8, minWidth: 200, alignItems: 'center' },
  emptyButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});