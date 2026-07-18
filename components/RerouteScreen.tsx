/**
 * RerouteScreen.tsx
 * ─────────────────────────────────────────────────────────────────
 * Full-screen slide-up modal for disruption reroute info.
 *
 * ONE component, THREE modes (FEATURE 1 — REROUTE):
 *   • 'affected'    — user's confirmed branch is hit by the disruption.
 *   • 'unaffected'  — disruption exists but on a DIFFERENT branch.
 *   • 'empty'       — disruption touches neither detected nor selected branch.
 *
 * Rule 10 (AGENTS.md): the UNAFFECTED state carries EQUAL design weight to the
 * affected state. Same glass card, same 4px accent bar, same typography, same
 * investment. No padding button, no lesser build. This is half the product.
 *
 * Scope boundary — verbatim, do not delete:
 *   Not a journey planner. Tube/Overground/DLR/Elizabeth Line only.
 *   Triggered only by active disruption on a route the user is on or
 *   pinned to. No destination search, ever. No transport mode expansion.
 *   Reject scope creep on sight. Cite this rule.
 * ─────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  Linking,
} from 'react-native';
import { getTier2Cache, Tier2Cache, Tier2Disruption } from '../services/tier2Cache';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BouncyPressable from './BouncyPressable';

// ─── Icons ────────────────────────────────────────────────────────
// The design system mandates Phosphor icons only (AGENTS.md: "Icons: Phosphor
// only"). This repo currently ships @expo/vector-icons (Ionicons) and does NOT
// have @phosphor-icons/react-native installed, so a hard Phosphor import would
// break the build. We alias the icon set here behind a single name so that when
// the Phosphor package is added, only this alias block changes. Until then it
// resolves to Ionicons — the closest available glyphs. FLAGGED: swap to real
// Phosphor once the dependency is installed.
import { Ionicons as PhosphorIcon } from '@expo/vector-icons';
import { GLASS } from '../theme/colors';
// Phosphor glyph mapping (intent): back → CaretLeft, signal-fail → Warning,
// clock → Clock, map-gm → MapTrifold, map-cm → MapPinLine, fine → CheckCircle.
const ICON = {
  back: 'chevron-back' as const,
  signalFail: 'warning' as const,
  clock: 'time-outline' as const,
  googleMaps: 'map-outline' as const,
  citymapper: 'location-outline' as const,
  fine: 'checkmark-circle-outline' as const,
};

// We read disruption from the P0 cache, never re-fetch TfL. The cache is the
// single source of truth for Reroute (see tier2Cache.ts SINGLE-WRITE DISCIPLINE).

// ─── Glass tokens ─────────────────────────────────────────────────
// CEO decision: the SHIPPED app is the source of truth. The shared GLASS token
// (theme/colors.ts) uses blurIntensity=45 + rgba(255,255,255,0.07). The master
// plan text said intensity=20 / rgba(0,0,0,0.28), but the live app was tuned
// away from that. We consume GLASS so Reroute stays consistent with every other
// card (DepartureCard, StationCard) and retunes in one place. Only the 4px
// LINE_COLORS accent bar is Reroute-specific (kept local).
const ACCENT_BAR_HEIGHT = 4;

// ─── Types ────────────────────────────────────────────────────────

export type RerouteMode = 'affected' | 'unaffected' | 'empty';

export interface RerouteScreenProps {
  /** Modal visibility. */
  visible: boolean;
  /** Close handler. */
  onClose: () => void;
  /** Which of the two states to render. */
  mode: RerouteMode;
  /** Line identity — drives the accent bar + header. */
  lineId: string;
  lineName: string;
  lineColor: string;
  /** User's confirmed branch terminus, e.g. 'Edgware'. */
  terminus: string;
  /** Human-readable disruption reason from the cache (affected mode). */
  disruptionReason?: string;
  /** Suggested alternate route (affected mode only). */
  suggestedRoute?: {
    description: string; // e.g. 'Take Bank branch to Euston\nCross-platform to Charing Cross branch'
    extraTimeMinutes: number;
  };
  /**
   * The other branch's name, used in unaffected copy.
   * e.g. 'Edgware' → "The disruption is on the Edgware branch, not yours."
   */
  otherBranchName?: string;
  /** Google Maps deep link — primary CTA, ALWAYS present in affected mode. */
  googleMapsUrl?: string;
  /** Citymapper deep link — secondary CTA, canOpenURL gated. */
  citymapperUrl?: string;
  /**
   * Optional explicit station id. When provided, on open we re-read the Tier 2
   * cache for that station so the sheet reflects the freshest disruption we have
   * (we never refetch TfL from here).
   */
  stationId?: string;
}

// ─── Component ────────────────────────────────────────────────────

export default function RerouteScreen({
  visible,
  onClose,
  mode,
  lineId,
  lineName,
  lineColor,
  terminus,
  disruptionReason,
  suggestedRoute,
  otherBranchName,
  googleMapsUrl = 'https://maps.google.com',
  citymapperUrl = 'citymapper://',
  stationId,
}: RerouteScreenProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  // ── Slide-up animation ─────────────────────────────────────────
  const translateY = useSharedValue(visible ? 0 : 900);

  useEffect(() => {
    if (reducedMotion) {
      translateY.value = visible ? 0 : 900;
    } else {
      translateY.value = withTiming(visible ? 0 : 900, { duration: 380, easing: Easing.out(Easing.ease) });
    }
  }, [visible, reducedMotion, translateY]);

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // ── Haptics on open AND close (impact only — no sound) ─────────
  const prevVisible = React.useRef(visible);
  useEffect(() => {
    if (visible && !prevVisible.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } else if (!visible && prevVisible.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    prevVisible.current = visible;
  }, [visible]);

  // ── Refresh disruption from the Tier 2 cache on open ───────────
  // We DO NOT hit TfL here. We read the P0 cache B1 populated.
  const [disruption, setDisruption] = useState<Tier2Disruption | null>(null);
  useEffect(() => {
    if (visible && stationId) {
      const cache: Tier2Cache | null = getTier2Cache(stationId);
      if (cache?.disruption) setDisruption(cache.disruption);
    }
  }, [visible, stationId]);

  // ── Citymapper availability (canOpenURL gate) ─────────────────
  // Rule 11: the Citymapper button is ABSENT (not greyed) when not installed.
  const [citymapperAvailable, setCitymapperAvailable] = useState(false);
  useEffect(() => {
    if (visible && mode === 'affected') {
      Linking.canOpenURL(citymapperUrl)
        .then(setCitymapperAvailable)
        .catch(() => setCitymapperAvailable(false));
    } else {
      setCitymapperAvailable(false);
    }
  }, [visible, mode, citymapperUrl]);

  // ── Open handlers ─────────────────────────────────────────────
  const handleOpenGoogleMaps = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Linking.openURL(googleMapsUrl).catch(() => {});
    onClose();
  };
  const handleOpenCitymapper = () => {
    if (!citymapperAvailable) return; // gated — absent, never greyed
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Linking.openURL(citymapperUrl).catch(() => {});
    onClose();
  };

  // ── Resolve the live reason (cache wins, prop fallback) ───────
  const resolvedReason = useMemo(() => {
    if (disruption?.reason) return disruption.reason;
    if (disruption?.description) return disruption.description;
    return disruptionReason;
  }, [disruption, disruptionReason]);

  // ── Render helpers ────────────────────────────────────────────

  const renderHeader = () => (
    <>
      {/* Drag handle (matches modal convention) */}
      <View style={s.handle} />

      {/* Back — ‹ Back, 44x44pt touch target */}
      <Pressable
        onPress={onClose}
        hitSlop={12}
        style={s.backButton}
        accessibilityLabel="Back"
        accessibilityRole="button"
      >
        <PhosphorIcon name={ICON.back} size={22} color="rgba(255,255,255,0.80)" />
        <Text style={s.backText}>Back</Text>
      </Pressable>

      {/* Line header with 4px LINE_COLORS accent bar */}
      <View style={s.lineHeaderRow}>
        <View
          style={[s.lineColorBar, { backgroundColor: lineColor, height: ACCENT_BAR_HEIGHT }]}
        />
        <Text style={s.lineHeaderName}>{lineName.toUpperCase()}</Text>
      </View>
    </>
  );

  const renderAffectedState = () => (
    <View style={s.body}>
      {/* Your <terminus> trains */}
      <Text style={s.branchLabel}>Your {terminus} trains</Text>

      {/* Disrupted badge + reason */}
      <View style={s.disruptionRow}>
        <PhosphorIcon name={ICON.signalFail} size={15} color="#FF9F43" />
        <Text style={s.disruptionLabel}>Disrupted</Text>
      </View>
      <Text style={s.disruptionReason}>
        {resolvedReason || 'Disruption reported on your route.'}
      </Text>

      {/* Divider */}
      <View style={s.divider} />

      {/* Suggested route glass card */}
      {suggestedRoute && (
        <View style={s.suggestedRouteCard}>
          <BlurView
            intensity={GLASS.blurIntensity}
            tint="light"
            style={StyleSheet.absoluteFillObject}
          />
          <Text style={s.suggestedRouteTitle}>Suggested route</Text>
          <Text style={s.suggestedRouteDesc}>{suggestedRoute.description}</Text>
          <View style={s.extraTimeRow}>
            <PhosphorIcon name={ICON.clock} size={13} color="rgba(255,255,255,0.45)" />
            <Text style={s.extraTimeText}>+{suggestedRoute.extraTimeMinutes} min</Text>
          </View>
        </View>
      )}

      {/* CTAs */}
      <View style={s.ctaSection}>
        {/* Primary — solid white, ALWAYS present in affected mode */}
        <BouncyPressable onPress={handleOpenGoogleMaps} style={s.primaryCta}>
          <PhosphorIcon
            name={ICON.googleMaps}
            size={18}
            color="#07103a"
            style={{ marginRight: 8 }}
          />
          <Text style={s.primaryCtaText}>Open in Google Maps</Text>
        </BouncyPressable>

        {/* Secondary — outline, canOpenURL gated, ABSENT if not installed */}
        {citymapperAvailable && (
          <BouncyPressable onPress={handleOpenCitymapper} style={s.secondaryCta}>
            <PhosphorIcon
              name={ICON.citymapper}
              size={18}
              color="rgba(255,255,255,0.80)"
              style={{ marginRight: 8 }}
            />
            <Text style={s.secondaryCtaText}>Open in Citymapper</Text>
          </BouncyPressable>
        )}
      </View>
    </View>
  );

  const renderUnaffectedState = () => (
    // EQUAL WEIGHT: same glass card, same accent bar, same typography as affected.
    // No CTA. No lesser build. This is half the product, not an afterthought.
    <View style={s.body}>
      <Text style={s.branchLabel}>Your {terminus} trains</Text>

      <View style={s.runningFineRow}>
        <View style={s.runningFineDot} />
        <Text style={s.runningFineLabel}>Running fine — no action needed</Text>
      </View>

      <Text style={s.disruptionReason}>
        {otherBranchName
          ? `The disruption is on the ${otherBranchName} branch, not yours.`
          : 'The disruption does not affect your route.'}
      </Text>
    </View>
  );

  const renderEmptyState = () => (
    // Single line, no forced card.
    <View style={s.body}>
      <View style={s.emptyStateRow}>
        <PhosphorIcon name={ICON.fine} size={22} color="rgba(255,255,255,0.35)" />
        <Text style={s.emptyStateText}>No impact on your usual routes.</Text>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        {/* Backdrop tap closes */}
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />

        <Animated.View
          style={[
            s.sheet,
            { paddingBottom: insets.bottom + 24 },
            sheetAnimatedStyle,
          ]}
        >
          {/* Glass: shared GLASS token (blurIntensity=45, white fill) over
              the sheet — consistent with every other card in the app. */}
          <BlurView
            intensity={GLASS.blurIntensity}
            tint="light"
            style={StyleSheet.absoluteFillObject}
          />
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: GLASS.background }]} />

          {renderHeader()}

          {mode === 'affected'
            ? renderAffectedState()
            : mode === 'unaffected'
              ? renderUnaffectedState()
              : renderEmptyState()}
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
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
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: 44, // 44x44pt touch target (Rule)
    paddingVertical: 8,
    paddingRight: 12,
    marginBottom: 6,
  },
  backText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 16,
    color: 'rgba(255,255,255,0.80)',
    marginLeft: 2,
  },
  lineHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  lineColorBar: {
    width: 3,
    borderRadius: 2,
  },
  lineHeaderName: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  // ── Body ──────────────────────────────────────────────────────
  body: {
    paddingTop: 4,
    paddingBottom: 8,
  },
  branchLabel: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 22,
    color: '#FFFFFF',
    letterSpacing: -0.3,
    marginBottom: 10,
  },
  disruptionRow: {
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
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginVertical: 16,
  },

  // ── Suggested route card (same glass treatment as the shell) ──
  suggestedRouteCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
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
  },

  // ── Unaffected ────────────────────────────────────────────────
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

  // ── Empty ─────────────────────────────────────────────────────
  emptyStateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  emptyStateText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 15,
    color: 'rgba(255,255,255,0.40)',
  },

  // ── CTAs ──────────────────────────────────────────────────────
  ctaSection: {
    gap: 10,
    marginTop: 4,
  },
  primaryCta: {
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    minHeight: 52, // 44x44pt+ target
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryCtaText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 16,
    color: '#07103a',
  },
  secondaryCta: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 26,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
    paddingHorizontal: 16,
  },
  secondaryCtaText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 16,
    color: 'rgba(255,255,255,0.80)',
  },
});
