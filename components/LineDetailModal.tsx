import React, { useMemo } from 'react';
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
import Animated from 'react-native-reanimated';
import { usePressAnimation } from '../hooks/usePressAnimation';

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
  statusType: 'good' | 'minor' | 'severe' | 'suspended' | 'closure' | 'loading' | 'error' | 'unknown' | 'offline' | string;
  statusLabel: string;
}

export function LineDetailModal({
  visible,
  onClose,
  line,
  statusType,
  statusLabel,
}: LineDetailModalProps) {
  const closePressAnim = usePressAnimation('back_btn', false);

  const reasonText = useMemo(() => {
    if (!line) return '';
    if (statusType === 'good') {
      const seed = line.id.charCodeAt(0) + line.id.charCodeAt(line.id.length - 1);
      const idx = seed % PERSONALITY_POOL.length;
      return PERSONALITY_POOL[idx];
    }
    return line.reason || line.status || statusLabel || 'Service is disrupted.';
  }, [line, statusType, statusLabel]);

  if (!line) return null;

  // Resolve status text colors
  let statusTextColor = 'rgba(255, 255, 255, 0.55)';
  if (statusType === 'good') statusTextColor = '#30D158';
  else if (statusType === 'minor') statusTextColor = '#FF9F0A';
  else if (statusType === 'severe' || statusType === 'suspended' || statusType === 'closure' || statusType === 'error') {
    statusTextColor = '#FF3B30';
  }

  // Resolve status pill colors
  let statusPillBg = 'rgba(255, 255, 255, 0.06)';
  let statusPillBorder = 'rgba(255, 255, 255, 0.15)';
  if (statusType === 'good') {
    statusPillBg = 'rgba(48, 209, 88, 0.1)';
    statusPillBorder = 'rgba(48, 209, 88, 0.2)';
  } else if (statusType === 'minor') {
    statusPillBg = 'rgba(255, 159, 10, 0.1)';
    statusPillBorder = 'rgba(255, 159, 10, 0.2)';
  } else if (statusType === 'severe' || statusType === 'suspended' || statusType === 'closure') {
    statusPillBg = 'rgba(255, 59, 48, 0.1)';
    statusPillBorder = 'rgba(255, 59, 48, 0.2)';
  }

  return (
    <Modal
      visible={visible}
      transparent={true}
      presentationStyle="overFullScreen"
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        {/* Translucent backdrop overlay */}
        <View
          style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0, 0, 0, 0.5)' }]}
        />

        {/* Pressable backdrop to dismiss */}
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss detail popup"
        />

        {/* Centered glassmorphic card */}
        <View style={styles.cardContainer}>
          <View style={styles.cardInner}>
            <BlurView
              intensity={80}
              tint="dark"
              style={StyleSheet.absoluteFillObject}
            />
            {/* Subtle background overlay */}
            <View style={styles.cardGlassOverlay} />

            {/* Header Row */}
            <View style={styles.headerRow}>
              <View style={styles.lineNameContainer}>
                <View style={[styles.brandDot, { backgroundColor: line.color }]} />
                <Text style={styles.lineName}>{line.name} Line</Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: statusPillBg, borderColor: statusPillBorder }]}>
                <Text style={[styles.statusPillText, { color: statusTextColor }]}>{statusLabel}</Text>
              </View>
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Reason details */}
            <ScrollView
              style={styles.scrollArea}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={true}
            >
              <Text style={styles.reasonText}>{reasonText}</Text>
            </ScrollView>

            {/* Close CTA */}
            <Animated.View style={[styles.closeBtnWrapper, closePressAnim.animatedStyle]}>
              <Pressable
                onPress={onClose}
                onPressIn={closePressAnim.onPressIn}
                onPressOut={closePressAnim.onPressOut}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Close details modal"
              >
                <Text style={styles.closeBtnText}>Close</Text>
              </Pressable>
            </Animated.View>
          </View>
        </View>
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
  cardContainer: {
    width: '90%',
    maxWidth: 400,
    maxHeight: SCREEN_HEIGHT * 0.65,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    elevation: 15,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  cardInner: {
    padding: 24,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.25)', // deep baseline dark
  },
  cardGlassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    pointerEvents: 'none',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  lineNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  brandDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 10,
  },
  lineName: {
    fontSize: 20,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#FFFFFF',
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPillText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 18,
    width: '100%',
  },
  scrollArea: {
    maxHeight: 180,
    width: '100%',
    marginBottom: 20,
  },
  scrollContent: {
    paddingRight: 4,
  },
  reasonText: {
    fontSize: 15,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: 24,
  },
  closeBtnWrapper: {
    width: '100%',
  },
  closeBtn: {
    height: 52,
    width: '100%',
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.30)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: 'rgba(255, 255, 255, 0.80)',
  },
});
