/**
 * RerouteSheet.tsx
 * ─────────────────────────────────────────────────────────────────
 * Full-screen slide-up modal for displaying disruption reroute info.
 * Two states: AFFECTED (user's branch hit) / UNAFFECTED (disruption
 * exists but on a different branch). Edge case: no impact message.
 * ─────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useCallback } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  Platform,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import BouncyPressable from './BouncyPressable';
import { GLASS } from '../theme/colors';

// ─── Types ──────────────────────────────────────────────────────────

export interface RerouteSheetProps {
  visible: boolean;
  onClose: () => void;
  lineId: string;
  lineName: string;
  lineColor: string;
  branchName: string;           // e.g. 'Edgware via Bank'
  terminus: string;              // e.g. 'Edgware'
  disruptionReason: string;     // from TfL line status reason
  isBranchAffected: boolean;    // true if user's specific branch is hit
  suggestedRoute?: {
    description: string;        // e.g. 'Take Bank branch to Euston...'
    extraTimeMinutes: number;
  };
  affectedBranchOnly?: boolean; // true = disruption is branch-specific
  onOpenGoogleMaps: () => void;
  onOpenCitymapper?: () => void;
}

// ─── Component ──────────────────────────────────────────────────────

export default function RerouteSheet({
  visible,
  onClose,
  lineId,
  lineName,
  lineColor,
  branchName,
  terminus,
  disruptionReason,
  isBranchAffected,
  suggestedRoute,
  affectedBranchOnly = false,
  onOpenGoogleMaps,
  onOpenCitymapper,
}: RerouteSheetProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  // ── Slide-up animation ───────────────────────────────────────────
  const translateY = useSharedValue(visible ? 0 : 800);

  useEffect(() => {
    if (reducedMotion) {
      translateY.value = visible ? 0 : 800;
    } else {
      translateY.value = withTiming(visible ? 0 : 800, { duration: 400 });
    }
  }, [visible, reducedMotion, translateY]);

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // ── Haptics on open ──────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
  }, [visible]);

  // ── Citymapper URL check ─────────────────────────────────────────
  const [citymapperAvailable, setCitymapperAvailable] = React.useState(false);

  useEffect(() => {
    if (visible) {
      Linking.canOpenURL('citymapper://')
        .then(setCitymapperAvailable)
        .catch(() => setCitymapperAvailable(false));
    }
  }, [visible]);

  // ── Render helpers ───────────────────────────────────────────────

  const renderHeader = () => (
    <>
      {/* Drag handle */}
      <View style={s.handle} />

      {/* Close button */}
      <Pressable
        onPress={onClose}
        hitSlop={12}
        style={s.closeButton}
        accessibilityLabel="Close"
        accessibilityRole="button"
      >
        <Ionicons name="close" size={20} color="rgba(255,255,255,0.60)" />
      </Pressable>

      {/* Line header with color accent bar */}
      <View style={s.lineHeaderRow}>
        <View style={[s.lineColorBar, { backgroundColor: lineColor }]} />
        <Text style={s.lineHeaderName}>{lineName.toUpperCase()}</Text>
      </View>
    </>
  );

  const renderAffectedState = () => (
    <>
      <View style={s.statusSection}>
        <Text style={s.branchLabel}>
          Your {terminus} trains
        </Text>
        <View style={s.disruptionBadge}>
          <Ionicons name="alert-circle" size={14} color="#FF9F43" />
          <Text style={s.disruptionLabel}>Disrupted</Text>
        </View>
        <Text style={s.disruptionReason}>{disruptionReason}</Text>
      </View>

      {suggestedRoute && (
        <View style={s.suggestedRouteCard}>
          <BlurView
            intensity={GLASS.blurIntensity}
            tint="dark"
            style={StyleSheet.absoluteFillObject}
          />
          <Text style={s.suggestedRouteTitle}>Suggested route</Text>
          <Text style={s.suggestedRouteDesc}>
            {suggestedRoute.description}
          </Text>
          <View style={s.extraTimeRow}>
            <Ionicons
              name="time-outline"
              size={13}
              color="rgba(255,255,255,0.45)"
            />
            <Text style={s.extraTimeText}>
              +{suggestedRoute.extraTimeMinutes} min
            </Text>
          </View>
        </View>
      )}

      {/* CTAs */}
      <View style={s.ctaSection}>
        <BouncyPressable onPress={onOpenGoogleMaps} style={s.primaryCta}>
          <Text style={s.primaryCtaText}>Open in Google Maps</Text>
        </BouncyPressable>

        {citymapperAvailable && onOpenCitymapper && (
          <BouncyPressable onPress={onOpenCitymapper} style={s.secondaryCta}>
            <Ionicons
              name="map-outline"
              size={16}
              color="rgba(255,255,255,0.80)"
              style={{ marginRight: 6 }}
            />
            <Text style={s.secondaryCtaText}>Open in Citymapper</Text>
          </BouncyPressable>
        )}
      </View>
    </>
  );

  const renderUnaffectedState = () => (
    <View style={s.statusSection}>
      <Text style={s.branchLabel}>
        Your {terminus} trains
      </Text>
      <View style={s.runningFineRow}>
        <View style={s.runningFineDot} />
        <Text style={s.runningFineLabel}>Running fine — no action needed</Text>
      </View>
      <Text style={s.disruptionReason}>
        {affectedBranchOnly
          ? `The disruption is on the ${branchName.replace(/^your /i, '')} branch, not yours.`
          : 'The disruption does not affect your route.'}
      </Text>
    </View>
  );

  const renderEmptyState = () => (
    <View style={s.statusSection}>
      <View style={s.emptyStateRow}>
        <Ionicons
          name="checkmark-circle-outline"
          size={24}
          color="rgba(255,255,255,0.30)"
        />
        <Text style={s.emptyStateText}>
          No impact on your usual routes.
        </Text>
      </View>
    </View>
  );

  // ── Determine which state to render ─────────────────────────────
  const hasSuggestedRoute = isBranchAffected && suggestedRoute;
  const showAffected = isBranchAffected;
  const showUnaffected = !isBranchAffected && affectedBranchOnly;
  const showEmpty = !isBranchAffected && !affectedBranchOnly;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <Pressable style={s.backdrop} onPress={onClose} />

        <Animated.View
          style={[
            s.sheet,
            { paddingBottom: insets.bottom + 24 },
            sheetAnimatedStyle,
          ]}
        >
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />

          {renderHeader()}

          {/* Divider */}

          {/* Content body */}
          <View style={s.body}>
            {showEmpty
              ? renderEmptyState()
              : showAffected
                ? renderAffectedState()
                : renderUnaffectedState()}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position: 'relative',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    maxHeight: '85%',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Line header ─────────────────────────────────────────────────
  lineHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  lineColorBar: {
    width: 3,
    height: 18,
    borderRadius: 2,
  },
  lineHeaderName: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  // ── Body ────────────────────────────────────────────────────────
  body: {
    flex: 1,
    marginTop: 8,
  },

  // ── Status section ──────────────────────────────────────────────
  statusSection: {
    marginBottom: 20,
  },
  branchLabel: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 22,
    color: '#FFFFFF',
    letterSpacing: -0.3,
    marginBottom: 10,
  },
  disruptionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  disruptionLabel: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 14,
    color: '#FF9F43',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  disruptionReason: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 18,
  },
  runningFineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 8,
  },
  runningFineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34D399',
  },
  runningFineLabel: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 14,
    color: '#34D399',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  // ── Suggested route card ────────────────────────────────────────
  suggestedRouteCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: Platform.OS === 'android' ? 'rgba(30, 30, 40, 0.9)' : GLASS.background,
    shadowColor: GLASS.shadowColor,
    shadowOffset: GLASS.shadowOffset,
    shadowOpacity: GLASS.shadowOpacity,
    shadowRadius: GLASS.shadowRadius,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    marginBottom: 20,
  },
  suggestedRouteTitle: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  suggestedRouteDesc: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 14,
    color: 'rgba(255,255,255,0.90)',
    lineHeight: 20,
    marginBottom: 8,
  },
  extraTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  extraTimeText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 13,
    color: 'rgba(255,255,255,0.50)',
    fontVariant: ['tabular-nums'],
  },

  // ── Empty state ─────────────────────────────────────────────────
  emptyStateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emptyStateText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 15,
    color: 'rgba(255,255,255,0.40)',
  },

  // ── CTAs ────────────────────────────────────────────────────────
  ctaSection: {
    gap: 10,
  },
  primaryCta: {
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryCtaText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 16,
    color: '#07103a',
  },
  secondaryCta: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 26,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
  },
  secondaryCtaText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 16,
    color: 'rgba(255,255,255,0.80)',
  },
});
