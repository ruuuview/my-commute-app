import React, { useMemo, useEffect, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
  Platform,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { GLASS } from '../theme/colors';
import { StatusBezel } from './StatusBezel';
import { CaretRight } from 'phosphor-react-native';
import { usePressAnimation } from '../hooks/usePressAnimation';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import {
  readCachedDisruption,
  fetchLineAffectedStops,
  stationsAffectedByStops,
  buildCitymapperDeepLink,
  TFL_GO_SCHEME,
} from './rerouteHelpers';
import type { AffectedStop } from './rerouteHelpers';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const POPUP_WIDTH = Math.min(SCREEN_WIDTH - 32, 380);
const MAX_POPUP_HEIGHT = SCREEN_HEIGHT * 0.55;

const PERSONALITY_POOL = [
  "Don't jinx it.",
  "Nothing to see here. Genuinely. Go enjoy that.",
  "All quiet. Suspiciously quiet.",
  "I've got nothing. Which is the whole point.",
  "Boring is the best thing I can be right now.",
  "Enjoy the smooth journey ahead.",
];

interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LineDetailModalProps {
  visible: boolean;
  onClose: () => void;
  line: {
    id: string;
    name: string;
    color: string;
    status?: string;
    reason?: string;
  } | null;
  statusType:
    | 'good'
    | 'minor'
    | 'severe'
    | 'suspended'
    | 'closure'
    | 'loading'
    | 'error'
    | 'unknown'
    | 'offline'
    | string;
  statusLabel: string;
  anchorRect: AnchorRect | null;
  onOpenReroute?: () => void;
  /** Optional station id — when provided, the CTA is gated on the Tier 2 cache
   *  (shown only when cache.disruption.isDisrupted is true; absent otherwise). */
  stationId?: string;
  /** Context badge for station impact display (Rule 34):
   *  'clear' → green "YOUR STATIONS OK"
   *  'affected' → red "SEVERE DELAYS"
   *  null/undefined → no badge (suppressed for vague TfL data) */
  contextBadge?: 'clear' | 'affected' | null;
}

const STATUS_TOKENS: Record<
  string,
  { text: string; pillBg: string; pillBorder: string; dotColor: string }
> = {
  good: {
    text: '#30D158',
    pillBg: 'rgba(48, 209, 88, 0.12)',
    pillBorder: 'rgba(48, 209, 88, 0.25)',
    dotColor: '#30D158',
  },
  minor: {
    text: '#FF9F0A',
    pillBg: 'rgba(255, 159, 10, 0.12)',
    pillBorder: 'rgba(255, 159, 10, 0.25)',
    dotColor: '#FF9F0A',
  },
  severe: {
    text: '#FF3B30',
    pillBg: 'rgba(255, 59, 48, 0.12)',
    pillBorder: 'rgba(255, 59, 48, 0.25)',
    dotColor: '#FF3B30',
  },
  suspended: {
    text: '#FF3B30',
    pillBg: 'rgba(255, 59, 48, 0.12)',
    pillBorder: 'rgba(255, 59, 48, 0.25)',
    dotColor: '#FF3B30',
  },
  closure: {
    text: '#FF3B30',
    pillBg: 'rgba(255, 59, 48, 0.12)',
    pillBorder: 'rgba(255, 59, 48, 0.25)',
    dotColor: '#FF3B30',
  },
  error: {
    text: '#FF3B30',
    pillBg: 'rgba(255, 59, 48, 0.12)',
    pillBorder: 'rgba(255, 59, 48, 0.25)',
    dotColor: '#FF3B30',
  },
};

const FALLBACK_TOKEN = {
  text: 'rgba(255, 255, 255, 0.50)',
  pillBg: 'rgba(255, 255, 255, 0.06)',
  pillBorder: 'rgba(255, 255, 255, 0.15)',
  dotColor: 'rgba(255, 255, 255, 0.35)',
};

export function LineDetailModal({
  visible,
  onClose,
  line,
  statusType,
  statusLabel,
  anchorRect,
  onOpenReroute,
  stationId,
  contextBadge,
}: LineDetailModalProps) {
  const insets = useSafeAreaInsets();
  const MIN_ALLOWED_TOP = insets.top + 12;

  const pinnedStations = useUserPreferencesStore(s => s.pinnedStations);
  const planRoutePress = usePressAnimation('continue_btn');

  // ── Disrupted gate (Rule 11) — shared by the affected/unaffected
  //    indicator, the 'Plan alternative route' deep link and the existing
  //    reroute CTA. When a stationId is available we gate on the Tier 2
  //    cache (reads from cache) and fall back to live line status when the
  //    cache hasn't been populated yet (user not at station). ──
  const isDisrupted = useMemo(() => {
    if (!line) return false;
    const isLiveDisruption =
      statusType !== 'good' &&
      statusType !== 'loading' &&
      statusType !== 'error' &&
      statusType !== 'unknown' &&
      statusType !== 'offline';
    if (!stationId) return isLiveDisruption;
    const cached = readCachedDisruption(stationId);
    return cached?.lineId === line.id ? !!cached.isDisrupted : isLiveDisruption;
  }, [line, stationId, statusType]);

  // Stations the user pinned on this line — origin for the deep link and
  // the affected-stops intersection below.
  const relevantPinnedStations = useMemo(() => {
    if (!line) return [];
    return pinnedStations.filter(
      p => Array.isArray(p.lines) && p.lines.includes(line.id)
    );
  }, [pinnedStations, line]);

  // Origin for 'Plan alternative route': the station whose modal is open,
  // else the line's first pinned station, else any pinned station, else the
  // line name itself (keep-it-simple contract).
  const originStationName = useMemo(() => {
    if (!line) return '';
    const byProp = stationId
      ? pinnedStations.find(p => p.id === stationId)
      : undefined;
    const byLine = relevantPinnedStations[0];
    const first = pinnedStations[0];
    return (byProp?.name || byLine?.name || first?.name || line.name).trim();
  }, [pinnedStations, stationId, relevantPinnedStations, line]);

  // ── Affected stops: the Tier 2 cache disruption shape and /api/lines do
  //    NOT carry affected StopPoints (canonical cache contract — never
  //    modified), so fetch the TfL Line disruption feed at popup-open time.
  //    Never throws; an empty result simply hides the indicator. ──
  const [affectedStops, setAffectedStops] = useState<AffectedStop[]>([]);
  const [stopsLoaded, setStopsLoaded] = useState(false);

  // Dep on the stable line id (the `line` object prop is recreated by the
  // dashboard each render) so the feed is fetched once per popup open.
  const lineId = line?.id ?? null;

  useEffect(() => {
    if (!visible || !lineId || !isDisrupted) {
      setAffectedStops([]);
      setStopsLoaded(false);
      return;
    }
    let active = true;
    setStopsLoaded(false);
    fetchLineAffectedStops(lineId).then(stops => {
      if (!active) return;
      setAffectedStops(stops);
      setStopsLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [visible, lineId, isDisrupted]);

  const stationImpacted = useMemo(
    () => stationsAffectedByStops(relevantPinnedStations, affectedStops).length > 0,
    [relevantPinnedStations, affectedStops]
  );

  // ── 'Plan alternative route' — Citymapper deep link first, TfL Go app
  //    fallback, in-app reroute CTA as last resort (mirrors RerouteScreen).
  const handlePlanAlternativeRoute = useCallback(() => {
    const openDeepLink = async () => {
      try {
        const citymapperUrl = buildCitymapperDeepLink(originStationName);
        if (await Linking.canOpenURL(citymapperUrl)) {
          await Linking.openURL(citymapperUrl);
          onClose();
          return;
        }
        if (await Linking.canOpenURL(TFL_GO_SCHEME)) {
          await Linking.openURL(TFL_GO_SCHEME);
          onClose();
          return;
        }
      } catch (e) {
        // Fall through to the in-app reroute CTA.
      }
      onOpenReroute?.();
      onClose();
    };
    openDeepLink();
  }, [originStationName, onOpenReroute, onClose]);

  // ── Compute anchored position ──
  const popupLeft = (SCREEN_WIDTH - POPUP_WIDTH) / 2;

  const popupTop = useMemo(() => {
    if (!anchorRect) return Math.max(SCREEN_HEIGHT / 2 - MAX_POPUP_HEIGHT / 2, MIN_ALLOWED_TOP);
    const spaceBelow = SCREEN_HEIGHT - (anchorRect.y + anchorRect.height);
    if (spaceBelow < 300) {
      return Math.max(60, anchorRect.y - MAX_POPUP_HEIGHT - 8);
    }
    return anchorRect.y + anchorRect.height + 8;
  }, [anchorRect, MIN_ALLOWED_TOP]);

  const safePopupTop = useMemo(() => {
    return Math.max(popupTop, MIN_ALLOWED_TOP);
  }, [popupTop, MIN_ALLOWED_TOP]);

  // ── Spring animation values ──
  const translateY = useSharedValue(0);
  const scale = useSharedValue(0.92);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      // Start from anchor bottom position
      const cardBottom = anchorRect ? anchorRect.y + anchorRect.height : safePopupTop + 12;
      const startOffset = anchorRect
        ? Math.min(cardBottom - safePopupTop, 40)
        : 12;
      // Clamp: negative offset means popup is above card, positive means below
      // The spring emerges from the card's edge toward final position
      const clampedOffset = Math.max(startOffset, -40);
      translateY.value = clampedOffset;
      scale.value = 0.92;
      opacity.value = 0;

      // Spring to final position — using withTiming for clean non-bouncy entry
      translateY.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.poly(3)) });
      scale.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.poly(3)) });
      opacity.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.poly(3)) });
    } else {
      translateY.value = 0;
      scale.value = 0.92;
      opacity.value = 0;
    }
  }, [visible, anchorRect, safePopupTop, opacity, scale, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: popupLeft },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  const token = STATUS_TOKENS[statusType] ?? FALLBACK_TOKEN;

  const displayLineName = useMemo(() => {
    if (!line) return '';
    const stripped = line.name.replace(/\s*line\s*$/i, '').trim();
    return `${stripped.toUpperCase()} LINE`;
  }, [line]);

  const reasonText = useMemo(() => {
    if (!line) return '';
    if (statusType === 'good') {
      const seed =
        line.id.charCodeAt(0) + line.id.charCodeAt(line.id.length - 1);
      return PERSONALITY_POOL[seed % PERSONALITY_POOL.length];
    }
    return (
      line.reason ||
      line.status ||
      statusLabel ||
      'Service information is currently unavailable.'
    );
  }, [line, statusType, statusLabel]);

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onClose();
  };

  if (!line) return null;

  return (
    <Modal
      visible={visible}
      transparent
      presentationStyle="overFullScreen"
      animationType="none"
      onRequestClose={handleClose}
    >
      <View style={styles.root}>
        {/* Whisper scrim — blocks underlying touch bleed */}
        <Pressable
          style={[StyleSheet.absoluteFillObject, styles.scrim]}
          onPress={handleClose}
          pointerEvents="auto"
          accessibilityRole="button"
          accessibilityLabel="Dismiss line detail"
        />

        {/* Anchored popup */}
        <Animated.View style={[styles.popupShadow, { top: safePopupTop }, animStyle]}>
          <Pressable style={styles.popupInner} onPress={(e) => e.stopPropagation()}>
            {Platform.OS !== 'android' && (
              <BlurView
                intensity={GLASS.blurIntensity}
                tint="dark"
                style={StyleSheet.absoluteFillObject}
              >
              </BlurView>
            )}

            {/* Outer glass tint */}
            <View style={styles.glassTint} pointerEvents="none" />

            {/* ── Content wrapper: scrollable when content is long ── */}
            <ScrollView
              style={{ maxHeight: MAX_POPUP_HEIGHT - 20 }}
              contentContainerStyle={{ paddingBottom: 4 }}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {/* ── Header: line name left, status pill right ── */}
              <View style={styles.heroHeader}>
                <View style={styles.heroLeft}>
                  <View style={[styles.colorBar, { backgroundColor: line.color }]} />
                  <Text style={styles.lineName} numberOfLines={1}>
                    {displayLineName}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: token.pillBg,
                      borderColor: token.pillBorder,
                    },
                  ]}
                >
                  <StatusBezel statusType={statusType} />
                  <Text style={[styles.statusText, { color: token.text }]}>
                    {statusLabel || 'Good Service'}
                  </Text>
                </View>
              </View>

              {/* ── Context Badge (Rule 34) — station impact indicator ── */}
              {contextBadge && (
                <View style={[
                  styles.contextBadge,
                  contextBadge === 'clear'
                    ? styles.contextBadgeClear
                    : styles.contextBadgeAffected,
                ]}>
                  <View style={[
                    styles.contextBadgeDot,
                    { backgroundColor: contextBadge === 'clear' ? '#34D399' : '#FF3B30' },
                  ]} />
                  <Text style={[
                    styles.contextBadgeText,
                    { color: contextBadge === 'clear' ? '#34D399' : '#FF3B30' },
                  ]}>
                    {contextBadge === 'clear' ? 'YOUR STATIONS OK' : 'SEVERE DELAYS'}
                  </Text>
                </View>
              )}

              {/* ── Full text description reason string ── */}
              {(() => {
                if (statusType === 'good') return false;
                const descTrimmed = reasonText.trim();
                if (!descTrimmed) return false;
                const descLower = descTrimmed.toLowerCase();
                const titleLower = (statusLabel || '').trim().toLowerCase();
                const isDuplicate = descLower === titleLower;
                return !isDuplicate;
              })() ? (
                <View style={styles.bodySection}>
                  <Text style={styles.bodyText}>{reasonText}</Text>
                </View>
              ) : null}

              {/* ── Disruption actions — only when disrupted ──\
                  Rule 11: absent (never greyed) when not disrupted.
                  1) affected/unaffected station indicator (computed from the
                     TfL Line disruption feed's affected StopPoints),
                  2) 'Plan alternative route' deep link (Citymapper →
                     tfl-go → in-app reroute CTA),
                  3) existing 'See alternative routes' CTA (kept in place). */}
              {isDisrupted && onOpenReroute ? (
                <>
                  {/* Affected/unaffected station indicator */}
                  {stopsLoaded && relevantPinnedStations.length > 0 ? (
                    <View
                      style={[
                        styles.impactBadge,
                        stationImpacted
                          ? styles.impactBadgeAffected
                          : styles.impactBadgeClear,
                      ]}
                    >
                      <View
                        style={[
                          styles.impactBadgeDot,
                          {
                            backgroundColor: stationImpacted
                              ? '#FF3B30'
                              : '#30D158',
                          },
                        ]}
                      />
                      <Text
                        style={[
                          styles.impactBadgeText,
                          {
                            color: stationImpacted ? '#FF3B30' : '#30D158',
                          },
                        ]}
                      >
                        {stationImpacted
                          ? 'Your station is affected'
                          : 'Your station is not affected'}
                      </Text>
                    </View>
                  ) : null}

                  {/* 'Plan alternative route' deep link */}
                  <AnimatedPressable
                    onPressIn={planRoutePress.onPressIn}
                    onPressOut={planRoutePress.onPressOut}
                    onPress={handlePlanAlternativeRoute}
                    style={[
                      styles.planRouteButton,
                      planRoutePress.animatedStyle,
                    ]}
                  >
                    <Text style={styles.planRouteButtonText}>
                      Plan alternative route
                    </Text>
                    <CaretRight size={14} color="rgba(255,255,255,0.55)" />
                  </AnimatedPressable>

                  {/* Existing reroute CTA — kept in place */}
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      onOpenReroute();
                      onClose();
                    }}
                    style={({ pressed }) => [
                      styles.rerouteButton,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={styles.rerouteButtonText}>See alternative routes</Text>
                    <CaretRight size={14} color="rgba(255,255,255,0.55)" />
                  </Pressable>
                </>
              ) : null}
            </ScrollView>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },

  popupShadow: {
    position: 'absolute',
    left: 0,
    width: POPUP_WIDTH,
    shadowColor: GLASS.shadowColor,
    shadowOffset: GLASS.shadowOffset,
    shadowOpacity: GLASS.shadowOpacity,
    shadowRadius: GLASS.shadowRadius,
    elevation: 15,
  },

  popupInner: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    backgroundColor: Platform.OS === 'android' ? '#0E0E14' : GLASS.background,
    padding: 0,
  },

  glassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 20,
  },

  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },

  heroLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },

  colorBar: {
    width: 3,
    height: 18,
    borderRadius: 2,
    marginRight: 10,
  },

  lineName: {
    fontSize: 15,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#FFFFFF',
    letterSpacing: 1.0,
    flexShrink: 1,
  },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 9999,
    paddingVertical: 5,
    paddingHorizontal: 10,
    flexShrink: 0,
  },

  statusText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  bodySection: {
    marginTop: 14,
    marginHorizontal: 20,
    marginBottom: 16,
  },

  bodyText: {
    fontSize: 14,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255, 255, 255, 0.78)',
    lineHeight: 22,
  },

  // ── Context Badge (Rule 34) ──────────────────────────────────
  contextBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 9999,
    borderWidth: 1,
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 4,
  },
  contextBadgeClear: {
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    borderColor: 'rgba(52, 211, 153, 0.25)',
  },
  contextBadgeAffected: {
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    borderColor: 'rgba(255, 59, 48, 0.25)',
  },
  contextBadgeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  contextBadgeText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  // ── Phase 6: affected/unaffected station indicator ─────────────
  impactBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 9999,
    borderWidth: 1,
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 2,
  },
  impactBadgeAffected: {
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    borderColor: 'rgba(255, 59, 48, 0.25)',
  },
  impactBadgeClear: {
    backgroundColor: 'rgba(48, 209, 88, 0.12)',
    borderColor: 'rgba(48, 209, 88, 0.25)',
  },
  impactBadgeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  impactBadgeText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  // ── Phase 6: 'Plan alternative route' deep link ────────────────
  planRouteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
  },
  planRouteButtonText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.95)',
    letterSpacing: 0.3,
  },

  // ── Reroute CTA ──────────────────────────────────────────────
  rerouteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  rerouteButtonText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.80)',
    letterSpacing: 0.3,
  },
});
