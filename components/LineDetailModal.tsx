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
}: LineDetailModalProps) {
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
        <BlurView
          intensity={25}
          tint="dark"
          style={StyleSheet.absoluteFillObject}
        />

        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss line detail"
        />

        <Animated.View style={[styles.cardShadowLayer, cardAnimStyle]}>
          <View style={styles.card}>
            <BlurView
              intensity={60}
              tint="dark"
              style={StyleSheet.absoluteFillObject}
            />

            <View style={styles.glassTint} pointerEvents="none" />

            <View style={styles.heroHeader}>
              <View
                style={[styles.colorBar, { backgroundColor: line.color }]}
              />
              <Text style={styles.lineName} numberOfLines={1}>
                {displayLineName}
              </Text>
            </View>

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
                <View
                  style={[styles.statusDot, { backgroundColor: token.dotColor }]}
                />
                <Text style={[styles.statusText, { color: token.text }]}>
                  {statusLabel || 'Good Service'}
                </Text>
              </View>
            </View>

            <ScrollView
              style={styles.bodyScroll}
              contentContainerStyle={styles.bodyScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.bodyText}>{reasonText}</Text>
            </ScrollView>

            <View style={styles.divider} />

            <View style={styles.dismissHintWrapper}>
              <Text style={styles.dismissHintText}>Tap anywhere to dismiss</Text>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  cardShadowLayer: {
    width: '88%',
    maxWidth: 380,
    maxHeight: SCREEN_HEIGHT * 0.62,
    borderRadius: 26,
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
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    padding: 0,
  },

  glassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 26,
  },

  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 20,
    paddingHorizontal: 22,
    paddingBottom: 0,
  },

  colorBar: {
    width: 4,
    height: 22,
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

  statusRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
    paddingBottom: 4,
    paddingHorizontal: 22,
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

  bodyScroll: {
    maxHeight: 180,
    marginTop: 16,
    marginHorizontal: 22,
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

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    marginTop: 16,
    marginHorizontal: 0,
  },

  dismissHintWrapper: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    alignItems: 'center',
  },

  dismissHintText: {
    fontSize: 11,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255, 255, 255, 0.25)',
    letterSpacing: 0.3,
  },
});
