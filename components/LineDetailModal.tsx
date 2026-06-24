import React, { useMemo, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { usePressAnimation } from '../hooks/usePressAnimation';
import * as Haptics from 'expo-haptics';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const PERSONALITY_POOL = [
  "Don't jinx it.",
  "Nothing to see here. Genuinely. Go enjoy that.",
  "All quiet. Suspiciously quiet.",
  "I've got nothing. Which is the whole point.",
  "Boring is the best thing I can be right now.",
  "Enjoy the smooth journey ahead.",
];

// ─── Types ────────────────────────────────────────────────────────
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
}

// ─── Token map ────────────────────────────────────────────────────
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

// ─── Component ────────────────────────────────────────────────────
export function LineDetailModal({
  visible,
  onClose,
  line,
  statusType,
  statusLabel,
}: LineDetailModalProps) {
  const closePressAnim = usePressAnimation('back_btn', false);

  // ── Spring-driven entry animation ──
  const cardScale = useSharedValue(0.92);
  const cardOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      cardScale.value = withSpring(1, { damping: 22, stiffness: 260 });
      cardOpacity.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.poly(3)) });
    } else {
      cardScale.value = withTiming(0.92, { duration: 160, easing: Easing.in(Easing.poly(2)) });
      cardOpacity.value = withTiming(0, { duration: 160 });
    }
  }, [visible, cardScale, cardOpacity]);

  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
    opacity: cardOpacity.value,
  }));

  // ── Status tokens ──
  const token = STATUS_TOKENS[statusType] ?? FALLBACK_TOKEN;

  // ── Reason / body copy ──
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

  // ── Dismiss with haptic ──
  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
        {/* ── Full-screen blurred backdrop ── */}
        <BlurView
          intensity={40}
          tint="dark"
          style={StyleSheet.absoluteFillObject}
        />

        {/* ── Scrim: darkens behind the card ── */}
        <View style={styles.scrim} />

        {/* ── Tap backdrop to dismiss ── */}
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss line detail"
        />

        {/* ── Glassmorphic card ── */}
        <Animated.View style={[styles.cardShadowLayer, cardAnimStyle]}>
          <View style={styles.card}>
            {/* Inner blur surface */}
            <BlurView
              intensity={90}
              tint="dark"
              style={StyleSheet.absoluteFillObject}
            />

            {/* Glass tint overlay */}
            <View style={styles.glassTint} pointerEvents="none" />

            {/* ════════════════════════════════════
                SECTION 1: HERO HEADER
                Line name + color bar accent
                ════════════════════════════════════ */}
            <View style={styles.heroHeader}>
              {/* Color bar — ONLY spans this header row */}
              <View
                style={[styles.colorBar, { backgroundColor: line.color }]}
              />
              <Text style={styles.lineName} numberOfLines={1}>
                {line.name.toUpperCase()} LINE
              </Text>
            </View>

            {/* ════════════════════════════════════
                SECTION 2: STATUS PILL (centered, own row)
                ════════════════════════════════════ */}
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusPill,
                  {
                    backgroundColor: token.pillBg,
                    borderColor: token.pillBorder,
                  },
                ]}
              >
                {/* Status dot */}
                <View
                  style={[styles.statusDot, { backgroundColor: token.dotColor }]}
                />
                <Text style={[styles.statusText, { color: token.text }]}>
                  {statusLabel || 'Good Service'}
                </Text>
              </View>
            </View>

            {/* ════════════════════════════════════
                SECTION 3: CONTEXTUAL BODY
                Full disruption text from TfL API
                ════════════════════════════════════ */}
            <ScrollView
              style={styles.bodyScroll}
              contentContainerStyle={styles.bodyScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.bodyText}>{reasonText}</Text>
            </ScrollView>

            {/* ── Divider ── */}
            <View style={styles.divider} />

            {/* ── Close CTA ── */}
            <Animated.View
              style={[styles.closeBtnWrapper, closePressAnim.animatedStyle]}
            >
              <Pressable
                onPress={handleClose}
                onPressIn={closePressAnim.onPressIn}
                onPressOut={closePressAnim.onPressOut}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Close line details"
              >
                <Text style={styles.closeBtnText}>Done</Text>
              </Pressable>
            </Animated.View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Scrim sits below the card
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    pointerEvents: 'none',
  },

  // ── Card ──────────────────────────────────────────────────────────
  cardShadowLayer: {
    width: '88%',
    maxWidth: 380,
    maxHeight: SCREEN_HEIGHT * 0.62,
    borderRadius: 26,
    // Layered shadows for depth
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.60,
    shadowRadius: 32,
    elevation: 20,
  },

  card: {
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    // Baseline dark fill beneath blur
    backgroundColor: 'rgba(12, 12, 20, 0.55)',
    padding: 0,
  },

  glassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 26,
  },

  // ── Section 1: Hero Header ────────────────────────────────────────
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 26,
    paddingHorizontal: 24,
    paddingBottom: 0,
    // Color bar is ONLY bound to this row via its explicit height
  },

  colorBar: {
    width: 4,
    height: 22,        // exact cap — matches line name cap-height
    borderRadius: 2,
    marginRight: 12,
  },

  lineName: {
    fontSize: 17,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#FFFFFF',
    letterSpacing: 1.2,
    flex: 1,
  },

  // ── Section 2: Status Row ─────────────────────────────────────────
  statusRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 22,
    paddingBottom: 4,
    paddingHorizontal: 24,
  },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: 9999,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  statusText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  // ── Section 3: Body ───────────────────────────────────────────────
  bodyScroll: {
    maxHeight: 180,
    marginTop: 22,
    marginHorizontal: 24,
    marginBottom: 0,
  },

  bodyScrollContent: {
    paddingBottom: 4,
  },

  bodyText: {
    fontSize: 15,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255, 255, 255, 0.78)',
    lineHeight: 24,
  },

  // ── Divider ──────────────────────────────────────────────────────
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    marginTop: 22,
    marginHorizontal: 0,
  },

  // ── Close CTA ────────────────────────────────────────────────────
  closeBtnWrapper: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },

  closeBtn: {
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  closeBtnText: {
    fontSize: 15,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: 'rgba(255, 255, 255, 0.85)',
    letterSpacing: 0.2,
  },
});
