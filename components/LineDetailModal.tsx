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
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const POPUP_WIDTH = Math.min(SCREEN_WIDTH - 32, 380);
const ESTIMATED_POPUP_HEIGHT = 260;

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
}: LineDetailModalProps) {
  const insets = useSafeAreaInsets();
  const MIN_ALLOWED_TOP = insets.top + 12;

  // ── Compute anchored position ──
  const popupLeft = (SCREEN_WIDTH - POPUP_WIDTH) / 2;

  const popupTop = useMemo(() => {
    if (!anchorRect) return Math.max(SCREEN_HEIGHT / 2 - ESTIMATED_POPUP_HEIGHT / 2, MIN_ALLOWED_TOP);
    const spaceBelow = SCREEN_HEIGHT - (anchorRect.y + anchorRect.height);
    if (spaceBelow < 300) {
      return Math.max(60, anchorRect.y - ESTIMATED_POPUP_HEIGHT - 8);
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
      const startOffset = anchorRect
        ? (anchorRect.y + anchorRect.height) - safePopupTop
        : 12;
      translateY.value = startOffset;
      scale.value = 0.92;
      opacity.value = 0;

      // Spring to final position
      translateY.value = withSpring(0, { damping: 18, stiffness: 200, overshootClamping: true });
      scale.value = withSpring(1, { damping: 18, stiffness: 200, overshootClamping: true });
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
          <Pressable style={styles.popup} onPress={(e) => e.stopPropagation()}>
            {Platform.OS !== 'android' && (
              <BlurView
                intensity={45}
                tint="dark"
                style={StyleSheet.absoluteFillObject}
              />
            )}

            {/* Outer glass tint */}
            <View style={styles.glassTint} pointerEvents="none" />

            {/* ── Content: Line title header ── */}
            <View style={styles.heroHeader}>
              <View style={[styles.colorBar, { backgroundColor: line.color }]} />
              <Text style={styles.lineName} numberOfLines={1}>
                {displayLineName}
              </Text>
            </View>

            {/* ── Inner tinted status pill ── */}
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
                <View style={[styles.statusDot, { backgroundColor: token.dotColor }]} />
                <Text style={[styles.statusText, { color: token.text }]}>
                  {statusLabel || 'Good Service'}
                </Text>
              </View>
            </View>

            {/* ── Full text description reason string ── */}
            {(() => {
              if (statusType === 'good') return false;
              const descTrimmed = reasonText.trim();
              const descLower = descTrimmed.toLowerCase();
              const titleLower = (statusLabel || '').trim().toLowerCase();
              const isDuplicate = descLower === titleLower;
              const isTooShort = descTrimmed.length < 20;
              const shouldHide = isDuplicate || isTooShort;
              return !shouldHide;
            })() ? (
              <ScrollView
                style={styles.bodyScroll}
                contentContainerStyle={styles.bodyScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.bodyText}>{reasonText}</Text>
              </ScrollView>
            ) : null}
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
    top: 0,
    left: 0,
    width: POPUP_WIDTH,
    borderRadius: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 15,
  },

  popup: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    backgroundColor: Platform.OS === 'android' ? '#0E0E14' : 'rgba(255, 255, 255, 0.07)',
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
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 0,
  },

  colorBar: {
    width: 4,
    height: 20,
    borderRadius: 2,
    marginRight: 12,
  },

  lineName: {
    fontSize: 16,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#FFFFFF',
    letterSpacing: 1.2,
    flex: 1,
  },

  statusRow: {
    alignItems: 'flex-start',
    paddingTop: 14,
    paddingBottom: 4,
    paddingHorizontal: 20,
  },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: 9999,
    paddingVertical: 7,
    paddingHorizontal: 14,
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

  bodyScroll: {
    maxHeight: 140,
    marginTop: 14,
    marginHorizontal: 20,
    marginBottom: 16,
  },

  bodyScrollContent: {
    paddingBottom: 4,
  },

  bodyText: {
    fontSize: 14,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255, 255, 255, 0.78)',
    lineHeight: 22,
  },
});
