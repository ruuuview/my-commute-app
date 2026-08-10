import React, { useMemo, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { GLASS } from '../theme/colors';
import { STATUS_SEVERITY_COLORS } from '../utils/getSeverityColor';
import { StatusBezel } from './StatusBezel';
import { CaretRight, CaretDown, X } from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import {
  readCachedDisruption,
  fetchLineAffectedStops,
  stationsAffectedByStops,
  stationsMentionedInReason,
} from './rerouteHelpers';
import type { AffectedStop } from './rerouteHelpers';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const POPUP_WIDTH = Math.min(SCREEN_WIDTH - 40, 380);
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

// Derived from the canonical severity palette (utils/getSeverityColor.ts —
// AGENTS.md §0: no component may compute severity color independently).
// Hex→rgba helper keeps the pill tints on-palette without a second copy.
function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const STATUS_TOKENS: Record<
  string,
  { text: string; pillBg: string; pillBorder: string; dotColor: string }
> = {
  good: {
    text: STATUS_SEVERITY_COLORS.good,
    pillBg: hexToRgba(STATUS_SEVERITY_COLORS.good, 0.12),
    pillBorder: hexToRgba(STATUS_SEVERITY_COLORS.good, 0.25),
    dotColor: STATUS_SEVERITY_COLORS.good,
  },
  minor: {
    text: STATUS_SEVERITY_COLORS.minor,
    pillBg: hexToRgba(STATUS_SEVERITY_COLORS.minor, 0.12),
    pillBorder: hexToRgba(STATUS_SEVERITY_COLORS.minor, 0.25),
    dotColor: STATUS_SEVERITY_COLORS.minor,
  },
  severe: {
    text: STATUS_SEVERITY_COLORS.severe,
    pillBg: hexToRgba(STATUS_SEVERITY_COLORS.severe, 0.12),
    pillBorder: hexToRgba(STATUS_SEVERITY_COLORS.severe, 0.25),
    dotColor: STATUS_SEVERITY_COLORS.severe,
  },
  suspended: {
    text: STATUS_SEVERITY_COLORS.severe,
    pillBg: hexToRgba(STATUS_SEVERITY_COLORS.severe, 0.12),
    pillBorder: hexToRgba(STATUS_SEVERITY_COLORS.severe, 0.25),
    dotColor: STATUS_SEVERITY_COLORS.severe,
  },
  closure: {
    text: STATUS_SEVERITY_COLORS.severe,
    pillBg: hexToRgba(STATUS_SEVERITY_COLORS.severe, 0.12),
    pillBorder: hexToRgba(STATUS_SEVERITY_COLORS.severe, 0.25),
    dotColor: STATUS_SEVERITY_COLORS.severe,
  },
  error: {
    text: STATUS_SEVERITY_COLORS.severe,
    pillBg: hexToRgba(STATUS_SEVERITY_COLORS.severe, 0.12),
    pillBorder: hexToRgba(STATUS_SEVERITY_COLORS.severe, 0.25),
    dotColor: STATUS_SEVERITY_COLORS.severe,
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

  // ── 'See alternative routes' — the reroute CTA (single disruption action).
  //    Rule 11: absent (never greyed) when not disrupted.

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

  // Clamp BOTH edges: the popup must never start above the safe area AND
  // never extend past the screen bottom (tab bar zone). Previously only the
  // top was clamped — a card anchored low on screen pushed the popup's footer
  // ("See alternative routes") off-screen behind the tab bar. The scroll
  // viewport inside is capped at MAX_POPUP_HEIGHT, so reserve that much room
  // below the top clamp.
  const safePopupTop = useMemo(() => {
    const maxTop = SCREEN_HEIGHT - MAX_POPUP_HEIGHT - (insets.bottom + 24);
    return Math.min(Math.max(popupTop, MIN_ALLOWED_TOP), Math.max(maxTop, MIN_ALLOWED_TOP));
  }, [popupTop, MIN_ALLOWED_TOP, insets.bottom]);

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

  // ── Scroll affordance — bottom fade + chevron ─────────────────
  // Visible only while content overflows the popup AND the user hasn't
  // scrolled to the end. Evaluated from live scroll metrics (no timers).
  const [popupMetrics, setPopupMetrics] = useState({ content: 0, layout: 0, offset: 0 });
  const fadeOpacity = useSharedValue(0);
  useEffect(() => {
    const { content, layout, offset } = popupMetrics;
    const canScroll = content > layout + 4;
    const atEnd = offset + layout >= content - 40;
    fadeOpacity.value = withTiming(canScroll && !atEnd ? 1 : 0, { duration: 180 });
  }, [popupMetrics, fadeOpacity]);

  const handlePopupScroll = (e: any) => {
    const y = e?.nativeEvent?.contentOffset?.y ?? 0;
    setPopupMetrics(m => ({ ...m, offset: y }));
  };
  const handlePopupContentSize = (_w: number, h: number) => {
    setPopupMetrics(m => ({ ...m, content: h }));
  };
  const handlePopupLayout = (e: any) => {
    const height = e?.nativeEvent?.layout?.height ?? 0;
    setPopupMetrics(m => ({ ...m, layout: height }));
  };

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

  // ── Station impact evidence (two independent sources) ────────────
  // 1. TfL Line disruption feed affectedStops (fetched at open) — reliable
  //    but often EMPTY for minor delays, so it can never prove "not affected".
  // 2. The disruption REASON text — if it names a pinned station
  //    (e.g. "between Camden Town and Morden"), that station IS affected
  //    even when the feed returns no stops (or the fetch fails/times out).
  const stationImpacted = useMemo(() => {
    if (relevantPinnedStations.length === 0) return false;
    if (stationsAffectedByStops(relevantPinnedStations, affectedStops).length > 0) {
      return true;
    }
    // Fallback evidence path: reason-text mention (never false-calm on an
    // empty affectedStops feed — the user's Camden Town case).
    return stationsMentionedInReason(relevantPinnedStations, reasonText).length > 0;
  }, [relevantPinnedStations, affectedStops, reasonText]);

  // Evidence gate: only render the impact badge when we actually have data.
  // An empty feed + no reason mention = "unknown", NOT "not affected".
  const hasImpactEvidence = useMemo(() => {
    if (relevantPinnedStations.length === 0) return false;
    if (stopsLoaded && affectedStops.length > 0) return true;
    return stationsMentionedInReason(relevantPinnedStations, reasonText).length > 0;
  }, [relevantPinnedStations, affectedStops, stopsLoaded, reasonText]);

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

        {/* Anchored popup — Apple liquid glass. popupShadow (plain Animated.View)
            owns layout + shape + hard cap. BlurView is an ABSOLUTE background
            sibling (UIVisualEffectView ignores maxHeight on iOS — never the
            layout container). ScrollView is an in-flow SIBLING: it drives the
            popup's height (capped), renders crisp ON TOP of the glass. */}
        <Animated.View style={[styles.popupShadow, { top: safePopupTop }, animStyle]}>
          <BlurView
            intensity={GLASS.blurIntensity}
            tint="dark"
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
          <View style={styles.glassTint} pointerEvents="none" />

          {/* ── Content wrapper: scrollable when content is long ── */}
          <ScrollView
            style={{ maxHeight: MAX_POPUP_HEIGHT - 20 }}
            contentContainerStyle={{ paddingBottom: 14 }}
            showsVerticalScrollIndicator
            scrollEnabled
            nestedScrollEnabled
            onScroll={handlePopupScroll}
            scrollEventThrottle={16}
            onContentSizeChange={handlePopupContentSize}
            onLayout={handlePopupLayout}
          >
              {/* ── Header: line name left, status pill right ── */}
              <View style={styles.heroHeader}>
                <View style={styles.heroLeft}>
                  <View style={[styles.colorBar, { backgroundColor: line.color }]} />
                  <Text style={styles.lineName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>
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
                    { backgroundColor: contextBadge === 'clear' ? STATUS_SEVERITY_COLORS.good : STATUS_SEVERITY_COLORS.severe },
                  ]} />
                  <Text style={[
                    styles.contextBadgeText,
                    { color: contextBadge === 'clear' ? STATUS_SEVERITY_COLORS.good : STATUS_SEVERITY_COLORS.severe },
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

              {/* ── Disruption actions — only when disrupted ──
                  Rule 11: absent (never greyed) when not disrupted.
                  1) affected/unaffected station indicator — rendered when user has pinned stations
                     or explicit evidence exists.
                  2) 'See alternative routes' CTA (single disruption action). */}
              {isDisrupted && onOpenReroute ? (
                <>
                  {/* Affected/unaffected station indicator */}
                  {relevantPinnedStations.length > 0 || hasImpactEvidence ? (
                    <View
                      style={[
                        styles.impactBadge,
                        stationImpacted
                          ? styles.impactBadgeAffected
                          : hasImpactEvidence
                            ? styles.impactBadgeClear
                            : { backgroundColor: 'rgba(255, 159, 10, 0.12)', borderColor: 'rgba(255, 159, 10, 0.25)' },
                      ]}
                    >
                      <View
                        style={[
                          styles.impactBadgeDot,
                          {
                            backgroundColor: stationImpacted
                              ? '#FF3B30'
                              : hasImpactEvidence
                                ? '#30D158'
                                : '#FF9F0A',
                          },
                        ]}
                      />
                      <Text
                        style={[
                          styles.impactBadgeText,
                          {
                            color: stationImpacted
                              ? '#FF3B30'
                              : hasImpactEvidence
                                ? '#30D158'
                                : '#FF9F0A',
                          },
                        ]}
                      >
                        {stationImpacted
                          ? 'Your station is affected'
                          : hasImpactEvidence
                            ? 'Your station is not affected'
                            : 'Line disruption reported'}
                      </Text>
                    </View>
                  ) : null}

                  {/* Reroute CTA — 'See alternative routes' (single action) */}
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

            {/* Fixed close button — top-right, does not scroll with content */}
            <Pressable
              onPress={handleClose}
              hitSlop={4}
              style={styles.closeButton}
              accessibilityLabel="Close"
              accessibilityRole="button"
            >
              <X size={20} color="rgba(255,255,255,0.75)" />
            </Pressable>

            {/* Scroll affordance — bottom fade + chevron, visible only
                while content overflows and the user hasn't reached the end */}
            <Animated.View pointerEvents="none" style={[styles.popupFade, { opacity: fadeOpacity }]}>
              <LinearGradient
                colors={['rgba(18,18,26,0)', 'rgba(18,18,26,0.95)']}
                style={StyleSheet.absoluteFillObject}
              />
              <CaretDown size={14} color="rgba(255,255,255,0.40)" />
            </Animated.View>
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },

  popupShadow: {
    position: 'absolute',
    left: 0,
    width: POPUP_WIDTH,
    maxHeight: MAX_POPUP_HEIGHT, // hard cap — popup can never exceed this
    borderRadius: 18, // shape owned here (BlurView is an absolute background)
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: GLASS.shadowColor,
    shadowOffset: GLASS.shadowOffset,
    shadowOpacity: GLASS.shadowOpacity,
    shadowRadius: GLASS.shadowRadius,
    elevation: 15,
  },

  glassTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },

  popupFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 48,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 14,
  },

  closeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },

  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
    paddingLeft: 16,
    paddingRight: 52,
    paddingBottom: 12,
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
    fontSize: 14.5,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#FFFFFF',
    letterSpacing: 0.9,
    flexShrink: 1,
  },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 9999,
    paddingVertical: 4,
    paddingHorizontal: 9,
    flexShrink: 0,
  },

  statusText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  bodySection: {
    marginTop: 12,
    marginHorizontal: 16,
    marginBottom: 14,
  },

  bodyText: {
    fontSize: 14,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255,255,255,0.78)',
    lineHeight: 21,
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
    marginHorizontal: 16,
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
    marginHorizontal: 16,
    marginTop: 8,
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

  // ── Reroute CTA ──────────────────────────────────────────────
  rerouteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  rerouteButtonText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.80)',
    letterSpacing: 0.3,
  },
});
