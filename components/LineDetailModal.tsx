import React, { useMemo, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
  Platform,
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
import { readCachedDisruption } from './rerouteHelpers';

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

              {/* ── See alternative routes CTA — only when disrupted ──\
                  Rule 11: absent (never greyed) when not disrupted. When a
                  stationId is available we gate on the Tier 2 cache
                  (reads from cache) and fall back to line status when the
                  cache hasn't been populated yet (user not at station). */}
              {(stationId
                ? (() => {
                    const cached = readCachedDisruption(stationId);
                    const isLiveDisruption =
                      statusType !== 'good' &&
                      statusType !== 'loading' &&
                      statusType !== 'error' &&
                      statusType !== 'unknown' &&
                      statusType !== 'offline';
                    // Cache populated & matches this line → use its disruption signal.
                    // Cache empty or line mismatch → fall back to live line status.
                    return cached?.lineId === line.id
                      ? !!cached.isDisrupted
                      : isLiveDisruption;
                  })()
                : (statusType !== 'good' &&
                  statusType !== 'loading' &&
                  statusType !== 'error' &&
                  statusType !== 'unknown' &&
                  statusType !== 'offline')) &&
              onOpenReroute ? (
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
