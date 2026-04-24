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
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MMKV } from 'react-native-mmkv';
// ✅ Import the real LivingDot with ripple rings
import LivingDot from './LivingDot';

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
const CACHE_KEY           = 'tfl_dashboard_cache';
const CACHE_TIMESTAMP_KEY = 'tfl_dashboard_timestamp';
const STALE_THRESHOLD_MS  = 3 * 60 * 1000; // 3 minutes

// ─── Types ───────────────────────────────────────────────────────────────────
type StatusSeverity = 'good' | 'minor' | 'severe' | 'part_closure' | 'suspended' | 'special' | 'unknown';
type BannerType     = 'stale' | 'offline' | 'error' | null;

interface TflLine {
  id:          string;
  name:        string;
  severity:    StatusSeverity;
  statusText:  string;
  disruption?: string;
}

interface Arrival {
  lineId:        string;
  lineName:      string;
  destination:   string;
  minutesUntil:  number;
  platform?:     string;
}

interface TflStation {
  id:       string;
  name:     string;
  arrivals: Arrival[];
}

interface DashboardData {
  lines:    TflLine[];
  stations: TflStation[];
}

// ─── Constants ───────────────────────────────────────────────────────────────
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const H_PAD       = 20;
const CARD_GAP    = 10;
const CARD_HEIGHT = 68;

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

function mapSeverity(severity: number): StatusSeverity {
  if (severity === 10 || severity === 18) return 'good';
  if (severity === 9  || severity === 14 || severity === 19) return 'minor';
  if (severity === 6  || severity === 7  || severity === 8  || severity === 17) return 'severe';
  return 'suspended';
}

function getLineColor(lineId: string): string {
  const colors: Record<string, string> = {
    bakerloo:           '#B36305',
    central:            '#E32017',
    circle:             '#FFD300',
    district:           '#00782A',
    'hammersmith-city': '#F3A9BB',
    jubilee:            '#A0A5A9',
    metropolitan:       '#9B0056',
    northern:           '#000000',
    piccadilly:         '#003688',
    victoria:           '#0098D4',
    'waterloo-city':    '#95CDBA',
    elizabeth:          '#6950A1',
    dlr:                '#00A4A7',
    overground:         '#EE7C0E',
    liberty:            '#A0A5A9',
    lioness:            '#FFD300',
    mildmay:            '#0098D4',
    suffragette:        '#6950A1',
    weaver:             '#B36305',
    windrush:           '#EE7C0E',
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
  if (lines.some(l => l.severity === 'minor'))   return 'minor';
  if (lines.some(l => l.severity === 'special'))  return 'special';
  if (lines.every(l => l.severity === 'good'))    return 'good';
  return 'unknown';
}

function getGradientColors(severity: StatusSeverity): [string, string, string] {
  switch (severity) {
    case 'severe':  return ['rgba(255,59,48,0.95)',  'rgba(180,30,20,0.45)',  'rgba(10,10,14,0.0)'];
    case 'minor':   return ['rgba(255,149,0,0.92)',  'rgba(180,100,0,0.40)',  'rgba(10,10,14,0.0)'];
    case 'good':    return ['rgba(52,199,89,0.88)',  'rgba(20,140,50,0.38)',  'rgba(10,10,14,0.0)'];
    default:        return ['rgba(28,28,46,1.0)',    'rgba(18,18,30,0.9)',    'rgba(10,10,14,0.0)'];
  }
}

// ─── FractalGlassBackground ──────────────────────────────────────────────────
const FractalGlassBackground = memo(({ worstSeverity, isOffline }: { worstSeverity: StatusSeverity; isOffline: boolean }) => {
  const effectiveSeverity = isOffline ? 'unknown' : worstSeverity;
  const [colors, setColors]       = useState<[string, string, string]>(getGradientColors(effectiveSeverity));
  const [prevColors, setPrevColors] = useState<[string, string, string]>(getGradientColors(effectiveSeverity));
  const fadeAnim = useSharedValue(0);

  useEffect(() => {
    const next = getGradientColors(effectiveSeverity);
    if (next[0] !== colors[0]) {
      setPrevColors(colors);
      setColors(next);
      fadeAnim.value = 0;
      fadeAnim.value = withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) });
    }
  }, [effectiveSeverity]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: fadeAnim.value }));

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* ✅ gradient goes to 0.78 so colour bleeds well past halfway */}
      <LinearGradient colors={prevColors} locations={[0, 0.45, 0.78]} style={StyleSheet.absoluteFill} />
      <Animated.View style={[StyleSheet.absoluteFill, overlayStyle]}>
        <LinearGradient colors={colors} locations={[0, 0.45, 0.78]} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
});

// ─── AppWordmark ─────────────────────────────────────────────────────────────
const AppWordmark = memo(({ worstSeverity, onRefreshComplete }: { worstSeverity: StatusSeverity; onRefreshComplete?: boolean }) => {
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (onRefreshComplete) {
      rotation.value = withTiming(360, { duration: 600, easing: Easing.inOut(Easing.ease) }, () => {
        rotation.value = 0;
      });
    }
  }, [onRefreshComplete]);

  const markStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
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

      {/* ✅ Real LivingDot as the header status indicator */}
      <Animated.View style={[{ marginTop: 6 }, markStyle]}>
        <LivingDot color={statusColor} size={12} />
      </Animated.View>
    </View>
  );
});

// ─── TrafficLightLoader ──────────────────────────────────────────────────────
const TrafficLightLoader = memo(({ visible, onComplete }: { visible: boolean; onComplete?: () => void }) => {
  const redOp       = useSharedValue(1);
  const amberOp     = useSharedValue(0.15);
  const greenOp     = useSharedValue(0.15);
  const greenSc     = useSharedValue(1);
  const containerOp = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    if (!visible) {
      containerOp.value = withTiming(0, { duration: 300 });
      return;
    }
    containerOp.value = withTiming(1, { duration: 200 });
    const startTime   = Date.now();
    const MIN_DISPLAY = 800;

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
        const elapsed   = Date.now() - startTime;
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
  }, [visible]);

  const rStyle         = useAnimatedStyle(() => ({ opacity: redOp.value }));
  const aStyle         = useAnimatedStyle(() => ({ opacity: amberOp.value }));
  const gStyle         = useAnimatedStyle(() => ({ opacity: greenOp.value, transform: [{ scale: greenSc.value }] }));
  const containerStyle = useAnimatedStyle(() => ({ opacity: containerOp.value }));

  return (
    <Animated.View style={[styles.trafficContainer, containerStyle]}>
      <Animated.View style={[styles.trafficDot, { backgroundColor: '#FF3B30' }, rStyle]} />
      <Animated.View style={[styles.trafficDot, { backgroundColor: '#FF9500' }, aStyle]} />
      <Animated.View style={[styles.trafficDot, { backgroundColor: '#34C759' }, gStyle]} />
    </Animated.View>
  );
});

// ─── StatusBanner ─────────────────────────────────────────────────────────────
const StatusBanner = memo(({ type, lastUpdated, onDismiss }: { type: BannerType; lastUpdated?: Date; onDismiss: () => void }) => {
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
      <BlurView intensity={40} tint="dark" style={styles.bannerPill}>
        <View style={[styles.bannerDot, { backgroundColor: accentColor }]} />
        <Text style={styles.bannerText}>{message}</Text>
      </BlurView>
    </Animated.View>
  );
});

// ─── BouncyButton ─────────────────────────────────────────────────────────────
const BouncyButton = ({ onPress, onLongPress, children, style, accessibilityLabel }: {
  onPress?: () => void;
  onLongPress?: () => void;
  children: React.ReactNode;
  style?: object;
  accessibilityLabel?: string;
}) => {
  const scale    = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={() => { scale.value = withSpring(0.97, { damping: 15, stiffness: 150, mass: 0.8 }); }}
        onPressOut={() => { scale.value = withSpring(1.0,  { damping: 15, stiffness: 150, mass: 0.8 }); }}
        style={[{ minHeight: 44, justifyContent: 'center' }, style]}
        accessibilityLabel={accessibilityLabel}
        activeOpacity={1}
        delayLongPress={500}
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
      -1, false,
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
  line:         TflLine;
  isStale:      boolean;
  isEditMode:   boolean;
  onLongPress:  () => void;
  onDelete:     (id: string) => void;
}

const LineCard = memo(({ line, isStale, isEditMode, onLongPress, onDelete }: LineCardProps) => {
  const [expanded, setExpanded]   = useState(false);
  const chevronRotation           = useSharedValue(0);
  const rotation                  = useSharedValue(0);
  const deleteBadgeScale          = useSharedValue(0);

  // ✅ FIX 2: Correct jiggle — passes through 0 so it swings cleanly both ways
  useEffect(() => {
    if (isEditMode) {
      rotation.value = withRepeat(
        withSequence(
          withTiming(-1.5, { duration: 100, easing: Easing.linear }),
          withTiming(0,    { duration: 100, easing: Easing.linear }),
          withTiming( 1.5, { duration: 100, easing: Easing.linear }),
          withTiming(0,    { duration: 100, easing: Easing.linear }),
        ),
        -1, false,
      );
    } else {
      rotation.value = withTiming(0, { duration: 150 });
    }
  }, [isEditMode]);

  // ✅ Delete badge pops in/out
  useEffect(() => {
    deleteBadgeScale.value = isEditMode
      ? withSpring(1, { damping: 12, stiffness: 200 })
      : withTiming(0, { duration: 100 });
  }, [isEditMode]);

  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const deleteBadgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: deleteBadgeScale.value }],
  }));

  const handlePress = () => {
    if (isEditMode) return;
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

  const lineColor   = getLineColor(line.id);
  const statusColor = getStatusColor(line.severity);

  return (
    <Animated.View style={[styles.lineCardWrapper, cardAnimStyle]}>
      {/* ✅ Red delete badge — top-left */}
      <Animated.View style={[styles.deleteBadgeContainer, deleteBadgeStyle]}>
        <TouchableOpacity
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
            onDelete(line.id);
          }}
          style={styles.deleteBadge}
          hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
          accessibilityLabel={`Remove ${line.name}`}
        >
          <Text style={styles.deleteBadgeIcon}>−</Text>
        </TouchableOpacity>
      </Animated.View>

      <TouchableOpacity
        onPress={handlePress}
        onLongPress={onLongPress}
        activeOpacity={0.85}
        delayLongPress={500}
        style={styles.lineCard}
      >
        {/* Coloured left accent bar */}
        <View style={[styles.accentBar, { backgroundColor: lineColor }]} />

        <View style={styles.lineCardInner}>
          <View style={styles.lineCardLeft}>
            <Text style={styles.lineName} numberOfLines={1} allowFontScaling maxFontSizeMultiplier={1.4}>
              {line.name}
            </Text>
            <Text style={[styles.lineStatus, { color: statusColor }]} numberOfLines={1} allowFontScaling maxFontSizeMultiplier={1.3}>
              {line.statusText}
            </Text>
            {line.disruption && !expanded && (
              <Text style={styles.disruptionPreview} numberOfLines={1} ellipsizeMode="tail">
                {line.disruption}
              </Text>
            )}
            {expanded && line.disruption && (
              <Text style={styles.disruptionFull}>{line.disruption}</Text>
            )}
          </View>

          <View style={styles.lineCardRight}>
            {/* ✅ FIX 1: Only pulse on disrupted lines — good service gets nothing */}
            {line.severity !== 'good' && line.severity !== 'unknown' && (
              <LivingDot color={statusColor} size={10} />
            )}
            {line.disruption && (
              <Animated.Text style={[styles.chevron, chevronStyle]}>›</Animated.Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── StationCard ──────────────────────────────────────────────────────────────
const StationCard = memo(({ station, isEditMode, onLongPress, onDelete }: {
  station: TflStation;
  isEditMode: boolean;
  onLongPress: () => void;
  onDelete: (id: string) => void;
}) => {
  const cleanName        = stripStationName(station.name);
  const arrivals         = station.arrivals.slice(0, 3);
  const rotation         = useSharedValue(0);
  const deleteBadgeScale = useSharedValue(0);

  // ✅ FIX 2: Correct jiggle — passes through 0 so it swings cleanly both ways
  useEffect(() => {
    if (isEditMode) {
      rotation.value = withRepeat(
        withSequence(
          withTiming(-1.5, { duration: 100, easing: Easing.linear }),
          withTiming(0,    { duration: 100, easing: Easing.linear }),
          withTiming( 1.5, { duration: 100, easing: Easing.linear }),
          withTiming(0,    { duration: 100, easing: Easing.linear }),
        ),
        -1, false,
      );
    } else {
      rotation.value = withTiming(0, { duration: 150 });
    }
  }, [isEditMode]);

  useEffect(() => {
    deleteBadgeScale.value = isEditMode
      ? withSpring(1, { damping: 12, stiffness: 200 })
      : withTiming(0, { duration: 100 });
  }, [isEditMode]);

  const cardAnimStyle    = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
  const deleteBadgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: deleteBadgeScale.value }] }));

  return (
    <Animated.View style={[styles.stationCardWrapper, cardAnimStyle]}>
      <Animated.View style={[styles.deleteBadgeContainer, deleteBadgeStyle]}>
        <TouchableOpacity
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
            onDelete(station.id);
          }}
          style={styles.deleteBadge}
          hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
          accessibilityLabel={`Remove ${cleanName}`}
        >
          <Text style={styles.deleteBadgeIcon}>−</Text>
        </TouchableOpacity>
      </Animated.View>

      <TouchableOpacity
        onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
        onLongPress={onLongPress}
        delayLongPress={500}
        activeOpacity={0.85}
      >
        <View style={styles.stationCard}>
          <View style={styles.stationHeader}>
            <View style={styles.trainIcon}>
              <View style={styles.trainBody} />
              <View style={styles.trainWindow} />
            </View>
            <Text style={styles.stationName} numberOfLines={1} allowFontScaling maxFontSizeMultiplier={1.4}>
              {cleanName}
            </Text>
          </View>

          {arrivals.map((arrival, idx) => {
            const isNow     = arrival.minutesUntil === 0;
            const isUrgent  = arrival.minutesUntil > 0 && arrival.minutesUntil <= 2;
            const timeColor = isNow ? '#FFFFFF' : isUrgent ? '#FF9500' : '#FFFFFF';
            const timeText  = isNow ? 'Now' : `${arrival.minutesUntil} min`;

            return (
              <View key={idx} style={styles.arrivalRow}>
                <Text style={[styles.arrivalLine, { color: getLineColor(arrival.lineId) }]} numberOfLines={1}>
                  {arrival.lineName.toUpperCase()}
                </Text>
                <Text style={styles.arrivalDest} numberOfLines={1} ellipsizeMode="tail">
                  {stripDestination(arrival.destination)}
                </Text>
                <Text style={[styles.arrivalTime, { color: timeColor }]}>{timeText}</Text>
              </View>
            );
          })}

          {arrivals.length === 0 && <Text style={styles.noArrivals}>No arrivals found</Text>}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── StatusHero ───────────────────────────────────────────────────────────────
const StatusHero = memo(({ lines }: { lines: TflLine[] }) => {
  const disrupted   = lines.filter(l => l.severity !== 'good' && l.severity !== 'unknown');
  const summaryText = disrupted.length === 0
    ? 'All clear'
    : disrupted.length === 1
    ? '1 line disrupted'
    : `${disrupted.length} lines disrupted`;
  const subText = disrupted.map(l => l.name).join(' · ');

  return (
    <View style={styles.statusHero}>
      <Text style={styles.heroEyebrow}>STATUS</Text>
      <Text style={styles.heroSummary}>{summaryText}</Text>
      {subText ? <Text style={styles.heroSub}>{subText}</Text> : null}
    </View>
  );
});

// ─── EmptyState ───────────────────────────────────────────────────────────────
const EmptyState = ({ hasLines, onAddLines, onAddStation }: { hasLines: boolean; onAddLines: () => void; onAddStation: () => void }) => {
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

  // ✅ Edit mode state — shared for both lines and stations
  const [linesEditMode, setLinesEditMode]       = useState(false);
  const [stationsEditMode, setStationsEditMode] = useState(false);

  // ✅ Use a ref for stations to avoid data dep in fetchData
  const stationsRef = useRef<TflStation[]>([]);

  const loadCachedData = useCallback(() => {
    try {
      const storage = getStorage();
      if (!storage) return;
      const cached = storage.getString(CACHE_KEY);
      const ts     = storage.getNumber(CACHE_TIMESTAMP_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as DashboardData;
        setData(parsed);
        stationsRef.current = parsed.stations ?? [];
        if (ts) {
          const age = Date.now() - ts;
          setIsStale(age > STALE_THRESHOLD_MS);
          setLastUpdated(new Date(ts));
          if (age > STALE_THRESHOLD_MS) setBannerType('stale');
        }
      }
    } catch (_) {}
  }, []);

  // ✅ FIX: removed `data` and `isStale` from deps — use refs instead
  const isStaleRef = useRef(false);

  const fetchData = useCallback(async (isManualRefresh = false) => {
    try {
      const response = await fetch('https://my-commute-backend.vercel.app/api/lines');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const raw = await response.json();

      const fresh: DashboardData = {
        lines: raw.map((item: any) => ({
          id:         item.id,
          name:       item.name,
          severity:   mapSeverity(item.status_severity),
          statusText: item.status,
          disruption: item.reason?.trim() || undefined,
        })),
        stations: stationsRef.current, // ✅ ref, not state — no re-render loop
      };

      setData(fresh);
      isStaleRef.current = false;
      setIsStale(false);
      setIsOffline(false);
      setBannerType(null);
      setLastUpdated(new Date());

      // ✅ ONLY fire haptic on manual pull-to-refresh, never on auto-poll
      if (isManualRefresh) {
        setRefreshComplete(true);
        setTimeout(() => setRefreshComplete(false), 800);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      const storage = getStorage();
      if (storage) {
        storage.set(CACHE_KEY, JSON.stringify(fresh));
        storage.set(CACHE_TIMESTAMP_KEY, Date.now());
      }
    } catch (err) {
      console.error('Vercel Sync Error:', err);
      loadCachedData();
      setIsOffline(true);
      setBannerType(isStaleRef.current ? 'error' : 'offline');
      setData(prev => prev || { lines: [], stations: [] });
    }
  }, [loadCachedData]); // ✅ stable — no data/isStale deps

  useEffect(() => {
    loadCachedData();
    fetchData(false).finally(() => setLoading(false));

    // Stale checker — only updates state, no fetch loop
    const interval = setInterval(() => {
      const storage = getStorage();
      if (!storage) return;
      const ts = storage.getNumber(CACHE_TIMESTAMP_KEY);
      if (ts && Date.now() - ts > STALE_THRESHOLD_MS) {
        isStaleRef.current = true;
        setIsStale(true);
        setBannerType('stale');
      }
    }, 30_000);

    return () => clearInterval(interval);
  }, []); // ✅ empty deps — runs once on mount

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await fetchData(true); // ✅ pass true = manual, triggers haptic
    setRefreshing(false);
  }, [fetchData]);

  // ✅ Delete handlers
  const handleDeleteLine = useCallback((id: string) => {
    setData(prev => {
      if (!prev) return prev;
      const next = { ...prev, lines: prev.lines.filter(l => l.id !== id) };
      if (next.lines.length === 0) setLinesEditMode(false);
      return next;
    });
  }, []);

  const handleDeleteStation = useCallback((id: string) => {
    setData(prev => {
      if (!prev) return prev;
      const next = { ...prev, stations: prev.stations.filter(s => s.id !== id) };
      stationsRef.current = next.stations;
      if (next.stations.length === 0) setStationsEditMode(false);
      return next;
    });
  }, []);

  const worstSeverity  = data ? getWorstSeverity(data.lines) : 'unknown';
  const disruptedLines = data?.lines.filter(l => l.severity !== 'good') ?? [];
  const goodLines      = data?.lines.filter(l => l.severity === 'good')  ?? [];

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar barStyle="light-content" />

      <FractalGlassBackground worstSeverity={worstSeverity} isOffline={isOffline} />

      {/* ✅ Banner sits above content, doesn't overlap scroll */}
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
        {/* Header */}
        <View style={styles.header}>
          <AppWordmark worstSeverity={worstSeverity} onRefreshComplete={refreshComplete} />
          <TrafficLightLoader visible={loading || refreshing} />
        </View>

        {/* Loading skeletons */}
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

            {/* ─── MY LINES ─── */}
            {data.lines.length > 0 && (
              <>
                {/* ✅ Section header with Edit/Done button */}
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionHeader}>MY LINES</Text>
                  <View style={styles.sectionHeaderActions}>
                    {data.lines.length > 0 && (
                      <TouchableOpacity
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          setLinesEditMode(e => !e);
                        }}
                        style={styles.editButton}
                      >
                        <Text style={styles.editButtonText}>{linesEditMode ? 'Done' : 'Edit'}</Text>
                      </TouchableOpacity>
                    )}
                    {/* ✅ + button on the right of section header */}
                    {!linesEditMode && (
                      <TouchableOpacity
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          router.push('/AddManageModal');
                        }}
                        style={styles.addIconButton}
                        accessibilityLabel="Add line"
                      >
                        <Text style={styles.addIconText}>＋</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* Disrupted lines — full width */}
                {[...disruptedLines]
                  .sort((a, b) => {
                    const order: Record<StatusSeverity, number> = {
                      suspended: 0, part_closure: 0, severe: 0, minor: 1, special: 2, good: 3, unknown: 4,
                    };
                    return order[a.severity] - order[b.severity];
                  })
                  .map(line => (
                    <LineCard
                      key={line.id}
                      line={line}
                      isStale={isStale}
                      isEditMode={linesEditMode}
                      onLongPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                        setLinesEditMode(true);
                      }}
                      onDelete={handleDeleteLine}
                    />
                  ))
                }

                {disruptedLines.length > 0 && goodLines.length > 0 && (
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionHeader}>GOOD SERVICE</Text>
                  </View>
                )}

                {/* Good service lines */}
                {goodLines.map(line => (
                  <LineCard
                    key={line.id}
                    line={line}
                    isStale={isStale}
                    isEditMode={linesEditMode}
                    onLongPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                      setLinesEditMode(true);
                    }}
                    onDelete={handleDeleteLine}
                  />
                ))}
              </>
            )}

            {/* ─── MY STATIONS ─── */}
            {(data.stations.length > 0 || data.lines.length > 0) && (
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeader}>MY STATIONS</Text>
                <View style={styles.sectionHeaderActions}>
                  {data.stations.length > 0 && (
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setStationsEditMode(e => !e);
                      }}
                      style={styles.editButton}
                    >
                      <Text style={styles.editButtonText}>{stationsEditMode ? 'Done' : 'Edit'}</Text>
                    </TouchableOpacity>
                  )}
                  {/* ✅ + button on right of stations header */}
                  {!stationsEditMode && (
                    <TouchableOpacity
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                      style={styles.addIconButton}
                      accessibilityLabel="Add station"
                    >
                      <Text style={styles.addIconText}>＋</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {data.stations.length === 0 && data.lines.length > 0 ? (
              <EmptyState hasLines={true} onAddLines={() => {}} onAddStation={() => {}} />
            ) : data.stations.length > 0 ? (
              data.stations.map(station => (
                <StationCard
                  key={station.id}
                  station={station}
                  isEditMode={stationsEditMode}
                  onLongPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                    setStationsEditMode(true);
                  }}
                  onDelete={handleDeleteStation}
                />
              ))
            ) : null}
          </>
        )}

        {!loading && data && data.lines.length === 0 && data.stations.length === 0 && (
          <EmptyState hasLines={false} onAddLines={() => {}} onAddStation={() => {}} />
        )}
      </ScrollView>
    </GestureHandlerRootView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#0A0A0A' },
  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: H_PAD },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },

  wordmarkRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  wordmarkMy:     { fontFamily: 'SpaceGrotesk-Regular', fontSize: 13, letterSpacing: 3, color: 'rgba(255,255,255,0.85)', lineHeight: 14 },
  wordmarkCommRow:{ flexDirection: 'row', alignItems: 'center', gap: 4 },
  wordmarkCommute:{ fontFamily: 'SpaceGrotesk-Bold', fontSize: 22, letterSpacing: 1, color: '#FFFFFF', lineHeight: 26 },
  proPill:        { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  proPillText:    { fontFamily: 'SpaceGrotesk-SemiBold', fontSize: 10, color: '#FFFFFF' },

  trafficContainer: { backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 22, paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center', gap: 6, height: 52, justifyContent: 'center' },
  trafficDot:       { width: 10, height: 10, borderRadius: 5 },

  // ✅ Banner fixed above scroll, not overlapping cards
  bannerWrapper: { position: 'absolute', top: 56, left: H_PAD, right: H_PAD, zIndex: 100, alignItems: 'center' },
  bannerPill:    { borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8, overflow: 'hidden' },
  bannerDot:     { width: 7, height: 7, borderRadius: 3.5 },
  bannerText:    { fontSize: 13, color: '#FFFFFF', fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif', flex: 1 },

  statusHero:  { paddingVertical: 8, marginBottom: 4 },
  heroEyebrow: { fontSize: 10, letterSpacing: 2, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', marginBottom: 4 },
  heroSummary: { fontSize: 17, fontWeight: '600', color: '#FFFFFF', marginBottom: 2 },
  heroSub:     { fontSize: 13, color: 'rgba(255,255,255,0.6)' },

  // ✅ Section header row with Edit + Add buttons
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 28,
    marginBottom: 10,
  },
  sectionHeader: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 12,
    letterSpacing: 3,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
  },
  sectionHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.18)',
    minHeight: 30,
    justifyContent: 'center',
  },
  editButtonText: { fontSize: 12, color: '#FFFFFF', fontWeight: '500' },

  // ✅ + icon button on header right
  addIconButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  addIconText: { fontSize: 16, color: '#FFFFFF', lineHeight: 20 },

  // ✅ Smaller, tighter line cards
  lineCardWrapper: {
    marginBottom: CARD_GAP,
    position: 'relative',
  },
  lineCard: {
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.08)',
    minHeight: CARD_HEIGHT,
    overflow: 'hidden',
  },
  accentBar:     { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  lineCardInner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 20, paddingRight: 14, paddingVertical: 12 },
  lineCardLeft:  { flex: 1, paddingRight: 10 },
  lineCardRight: { alignItems: 'center', gap: 4 },
  lineName:      { fontFamily: 'SpaceGrotesk-SemiBold', fontSize: 16, letterSpacing: -0.3, color: '#FFFFFF', marginBottom: 2 },
  lineStatus:    { fontSize: 13, color: '#FFFFFF', marginBottom: 1 },
  disruptionPreview: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  disruptionFull:    { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 4, lineHeight: 17 },
  chevron:       { fontSize: 17, color: 'rgba(255,255,255,0.4)', marginTop: 2 },

  // ✅ Delete badge
  deleteBadgeContainer: { position: 'absolute', top: -8, left: -8, zIndex: 20 },
  deleteBadge:   { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#0A0A0A' },
  deleteBadgeIcon: { fontSize: 16, color: '#FFFFFF', fontWeight: '700', lineHeight: 18, marginTop: -1 },

  stationCardWrapper: { width: '100%', marginBottom: CARD_GAP },
  stationCard:   { backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 14, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 16, paddingVertical: 12 },
  stationHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  trainIcon:     { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  trainBody:     { width: 14, height: 10, backgroundColor: '#007AFF', borderRadius: 2 },
  trainWindow:   { position: 'absolute', top: 2, left: 3, width: 4, height: 4, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 1 },
  stationName:   { fontFamily: 'SpaceGrotesk-SemiBold', fontSize: 16, color: '#FFFFFF', flex: 1 },

  arrivalRow:  { flexDirection: 'row', alignItems: 'center', borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.07)', paddingVertical: 9 },
  arrivalLine: { width: 56, fontSize: 11, fontWeight: '600' },
  arrivalDest: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.82)', paddingHorizontal: 4 },
  arrivalTime: { width: 52, fontSize: 14, fontFamily: 'SpaceGrotesk-Bold', textAlign: 'right' },
  noArrivals:  { fontSize: 13, color: 'rgba(255,255,255,0.4)', paddingTop: 8 },

  skeletonCard:    { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, height: 72, marginBottom: CARD_GAP, overflow: 'hidden', padding: 16, justifyContent: 'center' },
  skeletonShimmer: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.10)' },
  skeletonBar:     { height: 12, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 6, width: '40%', marginBottom: 4 },

  emptyFull:    { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyPartial: { alignItems: 'center', paddingTop: 32, gap: 10 },
  roundel:      { width: 48, height: 48, borderRadius: 24, borderWidth: 5, borderColor: '#E32017', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  roundelBar:   { width: 48, height: 8, backgroundColor: '#003688', position: 'absolute' },
  stationIcon:  { width: 32, height: 32, backgroundColor: '#007AFF', borderRadius: 8, marginBottom: 4 },
  emptyTitle:   { fontSize: 22, fontWeight: '600', color: '#FFFFFF', textAlign: 'center' },
  emptySub:     { fontSize: 15, color: 'rgba(255,255,255,0.6)', textAlign: 'center', paddingHorizontal: 24, lineHeight: 21 },
  emptyButton:  { backgroundColor: '#000000', borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14, marginTop: 8, minWidth: 200, alignItems: 'center' },
  emptyButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});