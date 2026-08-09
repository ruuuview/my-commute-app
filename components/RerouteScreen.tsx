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
  ScrollView,
  Dimensions,
} from 'react-native';
import { getTier2Cache, Tier2Cache, Tier2Disruption } from '../services/tier2Cache';
import { fetchLiveJourneyPenalty } from '../services/liveJourneyService';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BouncyPressable from './BouncyPressable';
import { BlurView } from 'expo-blur';
import { GLASS } from '../theme/colors';

// ─── Icons ────────────────────────────────────────────────────────
// The design system mandates Phosphor icons only (AGENTS.md: "Icons: Phosphor
// only"). This repo currently ships @expo/vector-icons (Ionicons) and does NOT
// have @phosphor-icons/react-native installed, so a hard Phosphor import would
// break the build. We alias the icon set here behind a single name so that when
// the Phosphor package is added, only this alias block changes. Until then it
// resolves to Ionicons — the closest available glyphs. FLAGGED: swap to real
// Phosphor once the dependency is installed.
import { CaretLeft, CaretDown, Warning, Clock, MapTrifold, MapPinLine, CheckCircle } from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { STATUS_SEVERITY_COLORS } from '../utils/getSeverityColor';
// ICON mapping — maps semantic names to Phosphor components.
const ICON = {
  back: CaretLeft,
  chevronDown: CaretDown,
  signalFail: Warning,
  clock: Clock,
  googleMaps: MapTrifold,
  citymapper: MapPinLine,
  fine: CheckCircle,
} as const;

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

// ─── Height constraints (Rule 32) ─────────────────────────────────
// App is locked to portrait (app.json "orientation": "portrait"), so static
// Dimensions at module scope is safe (mirrors LineDetailModal's proven
// MAX_POPUP_HEIGHT pattern).
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.48; // Rule 32: strictly under 50% screen height
// Sum of: 4px handle + 14px handle margin-bottom + 10px sheet paddingTop + 14px header margin-bottom + 6px backButton margin-bottom
const SHEET_HEADER_OFFSET = 48;

// ─── Types ────────────────────────────────────────────────────────

export type RerouteMode = 'affected' | 'unaffected' | 'empty';

export interface RerouteScreenProps {
  /** Modal visibility. */
  visible: boolean;
  /** Close handler. */
  onClose: () => void;
  /**
   * Branch grid — 2+ destinations for this line.
   * When provided with 4 entries, the component shows a 2x2 branch picker
   * before routing to the affected/unaffected/empty content for that branch.
   */
  branches?: string[];
  /**
   * Per-branch disruption status, computed from the TfL disruption reason.
   * 'affected' = branch is mentioned in the disruption text.
   * 'unaffected' = branch is not mentioned (likely running fine).
   */
  branchStatuses?: Record<string, 'affected' | 'unaffected'>;
  /** Which of the three states to render. */
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
  /** Confidence tier of direction confirmation engine ('high' | 'medium'). */
  confidence?: 'high' | 'medium';
  /** Source of direction confirmation engine ('session' | 'history' | 'pinned' | 'manual'). */
  source?: string;
  /** TfL severity code for this line. Used to determine dot color in branch grid:
   *  unaffected → green, affected+minor(9,7) → amber, affected+severe/suspended(≤6) → red. */
  severity?: number;
}

// ─── Component ────────────────────────────────────────────────────

export default function RerouteScreen({
  visible,
  onClose,
  branches,
  branchStatuses,
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
  confidence = 'high',
  source = 'manual',
  severity,
}: RerouteScreenProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  // ── Branch selection (2x2 grid) ────────────────────────────────
  // When branches has 4 entries the component shows a grid first.
  // internalBranch = null means "show grid"; set = "show detail for this branch."
  const [internalBranch, setInternalBranch] = useState<string | null>(null);
  const resolvedTerminus = internalBranch || terminus;
  const [isReasonExpanded, setIsReasonExpanded] = useState(false);
  useEffect(() => {
    if (visible) {
      setInternalBranch(null);
      setIsReasonExpanded(false);
    }
  }, [visible]);

  // ── Rule 38 spring transition: grid → detail ──────────────────
  // Outgoing grid: withSpring scale to 0.95 + withTiming opacity to 0 over 150ms.
  // Incoming card: withSpring translateY from +20px + withTiming opacity to 1 over 200ms
  //   (starts 50ms after grid exit begins).
  // Spring params: damping: 18, stiffness: 200. Never crossfade.
  const TRANSITION_DAMPING = 18;
  const TRANSITION_STIFFNESS = 200;
  const gridOpacity = useSharedValue(1);
  const gridScale = useSharedValue(1);
  const detailTranslateY = useSharedValue(0);
  const detailOpacity = useSharedValue(0);

  const gridAnimatedStyle = useAnimatedStyle(() => ({
    opacity: gridOpacity.value,
    transform: [{ scale: gridScale.value }],
  }));

  const detailAnimatedStyle = useAnimatedStyle(() => ({
    opacity: detailOpacity.value,
    transform: [{ translateY: detailTranslateY.value }],
  }));

  const [animPhase, setAnimPhase] = useState<'grid' | 'exiting' | 'detail'>('grid');

  const handleBranchTap = (branch: string) => {
    if (reducedMotion) {
      setInternalBranch(branch);
      setAnimPhase('detail');
      return;
    }
    setAnimPhase('exiting');
    // Phase 1: animate grid out
    gridOpacity.value = withTiming(0, { duration: 150 });
    gridScale.value = withSpring(0.95, { damping: TRANSITION_DAMPING, stiffness: TRANSITION_STIFFNESS });
    // Phase 2: after 50ms delay, animate detail in
    setTimeout(() => {
      detailTranslateY.value = withSpring(0, { damping: TRANSITION_DAMPING, stiffness: TRANSITION_STIFFNESS });
      detailOpacity.value = withTiming(1, { duration: 200 });
      setInternalBranch(branch);
      setAnimPhase('detail');
    }, 50);
  };

  // Reset animation state when sheet opens or returns to grid
  useEffect(() => {
    if (!internalBranch) {
      gridOpacity.value = 1;
      gridScale.value = 1;
      detailTranslateY.value = 20;
      detailOpacity.value = 0;
      setAnimPhase('grid');
    }
  }, [internalBranch, gridOpacity, gridScale, detailTranslateY, detailOpacity]);

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

  // ── Live TfL Journey Planner Calculation (Dynamic Real-Time Extra Time) ──
  const [liveExtraTime, setLiveExtraTime] = useState<number | null>(null);
  const [isLiveResolving, setIsLiveResolving] = useState<boolean>(false);
  const [isLiveFallback, setIsLiveFallback] = useState<boolean>(false);

  useEffect(() => {
    if (!visible || !stationId || !resolvedTerminus) {
      setLiveExtraTime(null);
      setIsLiveResolving(false);
      setIsLiveFallback(false);
      return;
    }

    let active = true;
    setIsLiveResolving(true);
    setIsLiveFallback(false);

    fetchLiveJourneyPenalty({
      originStationId: stationId,
      destinationTerminus: resolvedTerminus,
      lineId,
    }).then(result => {
      if (!active) return;
      setIsLiveResolving(false);
      if (result && typeof result.extraTimeMinutes === 'number') {
        setLiveExtraTime(result.extraTimeMinutes);
        setIsLiveFallback(false);
      } else {
        setIsLiveFallback(true);
      }
    });

    return () => {
      active = false;
    };
  }, [visible, stationId, resolvedTerminus, lineId]);

  const effectiveMode = internalBranch && branchStatuses
    ? (branchStatuses[internalBranch] === 'affected' ? 'affected' : 'unaffected')
    : mode;

  // ── Citymapper availability (canOpenURL gate) ─────────────────
  // Rule 11: the Citymapper button is ABSENT (not greyed) when not installed.
  const [citymapperAvailable, setCitymapperAvailable] = useState(false);
  useEffect(() => {
    if (visible && effectiveMode === 'affected') {
      Linking.canOpenURL(citymapperUrl)
        .then(setCitymapperAvailable)
        .catch(() => setCitymapperAvailable(false));
    } else {
      setCitymapperAvailable(false);
    }
  }, [visible, effectiveMode, citymapperUrl]);

  // ── Scroll affordance — bottom fade + chevron ─────────────────
  // Visible only while content overflows the sheet AND the user hasn't
  // scrolled to the end. Evaluated from live scroll metrics (no timers).
  const [scrollMetrics, setScrollMetrics] = useState({ content: 0, layout: 0, offset: 0 });
  const fadeOpacity = useSharedValue(0);
  useEffect(() => {
    const { content, layout, offset } = scrollMetrics;
    const canScroll = content > layout + 4;
    const atEnd = offset + layout >= content - 40;
    const show = canScroll && !atEnd;
    fadeOpacity.value = withTiming(show ? 1 : 0, { duration: 180 });
  }, [scrollMetrics, fadeOpacity]);

  const handleSheetScroll = (e: any) => {
    const offset = e?.nativeEvent?.contentOffset?.y ?? 0;
    setScrollMetrics(m => ({ ...m, offset }));
  };
  const handleSheetContentSize = (_w: number, h: number) => {
    setScrollMetrics(m => ({ ...m, content: h }));
  };
  const handleSheetLayout = (e: any) => {
    const layoutHeight = e?.nativeEvent?.layout?.height ?? 0;
    setScrollMetrics(m => ({ ...m, layout: layoutHeight }));
  };

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

  // ── Back handler: grid → close, detail → back to grid ─────────
  const handleBack = () => {
    if (internalBranch && branches && branches.length > 2) {
      setInternalBranch(null); // return to branch grid
    } else {
      onClose(); // close the drawer
    }
  };

  const renderHeader = () => (
    <>
      {/* Drag handle (matches modal convention) */}
      <View style={s.handle} />

      {/* Back — ‹ Back, 44x44pt touch target */}
      <Pressable
        onPress={handleBack}
        hitSlop={12}
        style={s.backButton}
        accessibilityLabel="Back"
        accessibilityRole="button"
      >
        <ICON.back size={22} color="rgba(255,255,255,0.80)" />
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
      {/* Your <terminus> trains + Change button */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={s.branchLabel}>
          {confidence === 'medium' ? `Likely your ${resolvedTerminus} trains` : `Your ${resolvedTerminus} trains`}
        </Text>
        {branches && branches.length > 1 && (
          <BouncyPressable
            onPress={() => {
              setInternalBranch(null);
              setLiveExtraTime(null);
              setIsLiveResolving(true);
            }}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 8,
              backgroundColor: confidence === 'medium' ? 'rgba(255,149,0,0.20)' : 'rgba(255,255,255,0.12)',
            }}
          >
            <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 12, color: confidence === 'medium' ? '#FF9500' : 'rgba(255,255,255,0.85)' }}>
              Change
            </Text>
          </BouncyPressable>
        )}
      </View>

      {/* Disrupted badge + reason */}
      <View style={s.disruptionRow}>
        <ICON.signalFail size={15} color={STATUS_SEVERITY_COLORS.minor} />
        <Text style={s.disruptionLabel}>Disrupted</Text>
      </View>
      <Pressable onPress={() => setIsReasonExpanded(prev => !prev)} hitSlop={4}>
        <Text style={s.disruptionReason} numberOfLines={isReasonExpanded ? undefined : 3} ellipsizeMode="tail">
          {resolvedReason || 'Disruption reported on your route.'}
        </Text>
        {resolvedReason && resolvedReason.length > 120 && (
          <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
            {isReasonExpanded ? 'Show less' : 'Tap to read full status'}
          </Text>
        )}
      </Pressable>

      {/* Divider */}
      <View style={s.divider} />

      {/* Suggested route glass card — static dark glass (no live blur: iOS
          UIVisualEffectView janks scroll; flat translucent fill reads as
          frosted at a fraction of the cost) */}
      {suggestedRoute && (
        <View style={s.suggestedRouteCard}>
          <Text style={s.suggestedRouteTitle}>Suggested route</Text>
          <Text style={s.suggestedRouteDesc}>{suggestedRoute.description}</Text>
          <View style={s.extraTimeRow}>
            <ICON.clock size={13} color="rgba(255,255,255,0.45)" />
            <Text style={[s.extraTimeText, isLiveResolving && { opacity: 0.4 }]}>
              {isLiveResolving
                ? '+·· min'
                : liveExtraTime !== null
                  ? `+${liveExtraTime} min`
                  : `${isLiveFallback ? '~' : '+'}${suggestedRoute.extraTimeMinutes} min`}
            </Text>
          </View>
        </View>
      )}

      {/* CTAs */}
      <View style={s.ctaSection}>
        {/* Primary — solid white, ALWAYS present in affected mode */}
        <BouncyPressable onPress={handleOpenGoogleMaps} style={s.primaryCta}>
          <ICON.googleMaps
            size={18}
            color="#07103a"
            style={{ marginRight: 8 }}
          />
          <Text style={s.primaryCtaText}>Open in Google Maps</Text>
        </BouncyPressable>

        {/* Secondary — outline, canOpenURL gated, ABSENT if not installed */}
        {citymapperAvailable && (
          <BouncyPressable onPress={handleOpenCitymapper} style={s.secondaryCta}>
            <ICON.citymapper
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
      <Text style={s.branchLabel}>Your {resolvedTerminus} trains</Text>

      <View style={s.runningFineRow}>
        <View style={s.runningFineDot} />
        <Text style={s.runningFineLabel}>Running fine — no action needed</Text>
      </View>

      <Text style={s.disruptionReason} numberOfLines={3} ellipsizeMode="tail">
        {otherBranchName
          ? `The disruption is on the ${otherBranchName} branch, not yours.`
          : 'The disruption does not affect your route.'}
      </Text>

      {/* Rule 33 — GOT IT dismiss button */}
      <BouncyPressable onPress={onClose} style={s.gotItButton}>
        <Text style={s.gotItButtonText}>Got it</Text>
      </BouncyPressable>
    </View>
  );

  const renderEmptyState = () => (
    // Single line, no forced card.
    <View style={s.body}>
      <View style={s.emptyStateRow}>
        <ICON.fine size={22} color="rgba(255,255,255,0.35)" />
        <Text style={s.emptyStateText}>No impact on your usual routes.</Text>
      </View>
    </View>
  );

  // ── Branch selection grid (2x2 for 4-branch lines) ──────────
  const renderBranchGrid = () => {
    if (!branches || branches.length <= 2) return null;
    // Split branches into pairs for rows
    const rows: string[][] = [];
    for (let i = 0; i < branches.length; i += 2) {
      rows.push(branches.slice(i, i + 2));
    }

    return (
      <View style={s.branchGridBody}>
        <Text style={s.branchGridTitle}>Where are you headed?</Text>
        {rows.map((row, ri) => (
          <View key={ri} style={s.branchGridRow}>
            {row.map((branch) => {
              const status = branchStatuses?.[branch];
              const isAffected = status === 'affected';
              return (
                <Pressable
                  key={branch}
                  style={s.branchGridCard}
                  onPress={() => handleBranchTap(branch)}
                >
                  <Text style={s.branchCardName} numberOfLines={1} ellipsizeMode="tail">
                    {branch}
                  </Text>
                  <View style={s.branchCardRight}>
                    <Text style={s.branchCardStatus}>
                      {isAffected ? 'Affected' : 'Running fine'}
                    </Text>
                    <View
                      style={[
                        s.branchStatusDot,
                        {
                          backgroundColor: isAffected
                            ? severity !== undefined && (severity === 9 || severity === 7)
                              ? STATUS_SEVERITY_COLORS.minor
                              : STATUS_SEVERITY_COLORS.severe
                            : STATUS_SEVERITY_COLORS.good,
                        },
                      ]}
                    />
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
        <BouncyPressable onPress={onClose} style={s.branchGridDismiss}>
          <Text style={s.branchGridDismissText}>Dismiss</Text>
        </BouncyPressable>
      </View>
    );
  };

  // ── Show branch grid or mode-specific detail ────────────────
  const hasGrid = Boolean(branches && branches.length > 2);
  const showGrid = hasGrid && !internalBranch;
  const detailMode = internalBranch && branchStatuses
    ? branchStatuses[internalBranch] === 'affected'
      ? 'affected'
      : 'unaffected'
    : mode;

  useEffect(() => {
    if (visible) {
      setInternalBranch(null);
      if (!hasGrid) {
        detailOpacity.value = 1;
        detailTranslateY.value = 0;
      } else {
        gridOpacity.value = 1;
        gridScale.value = 1;
        detailTranslateY.value = 20;
        detailOpacity.value = 0;
        setAnimPhase('grid');
      }
    }
  }, [visible, hasGrid, detailOpacity, detailTranslateY, gridOpacity, gridScale]);

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
            { paddingBottom: insets.bottom + 16 },
            sheetAnimatedStyle,
          ]}
        >
          {/* Apple liquid glass — the plain s.sheet View owns layout + clip */}
          <BlurView intensity={GLASS.blurIntensity} tint="dark" style={StyleSheet.absoluteFillObject} pointerEvents="none" />
          <View style={[StyleSheet.absoluteFillObject, s.sheetTint]} pointerEvents="none" />
          <View style={[StyleSheet.absoluteFillObject, s.sheetRim]} pointerEvents="none" />

          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator
            scrollEnabled
            nestedScrollEnabled
            onScroll={handleSheetScroll}
            scrollEventThrottle={16}
            onContentSizeChange={handleSheetContentSize}
            onLayout={handleSheetLayout}
          >
            {renderHeader()}

            {showGrid && animPhase !== 'detail' ? (
              <Animated.View style={gridAnimatedStyle}>
                {renderBranchGrid()}
              </Animated.View>
            ) : null}

            {!showGrid ? (
              <Animated.View style={hasGrid ? detailAnimatedStyle : undefined}>
                {detailMode === 'affected'
                  ? renderAffectedState()
                  : detailMode === 'unaffected'
                    ? renderUnaffectedState()
                    : renderEmptyState()}
              </Animated.View>
            ) : null}
          </ScrollView>

          {/* Scroll affordance — bottom fade + chevron, visible only while
              content overflows and the user hasn't reached the end */}
          <Animated.View pointerEvents="none" style={[s.scrollFade, { opacity: fadeOpacity }]}>
            <LinearGradient
              colors={['rgba(12,12,18,0)', 'rgba(12,12,18,0.96)']}
              style={StyleSheet.absoluteFillObject}
            />
            <ICON.chevronDown size={16} color="rgba(255,255,255,0.45)" />
          </Animated.View>
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
    maxHeight: SHEET_MAX_HEIGHT, // Rule 32 — strictly under 50% screen height
    overflow: 'hidden', // clip guard: inner glass can never extend past screen bottom
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sheetTint: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  sheetRim: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.10)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  scroll: {
    flexGrow: 0,
    maxHeight: SHEET_MAX_HEIGHT - SHEET_HEADER_OFFSET,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  scrollFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 64,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignSelf: 'center',
    marginBottom: 10,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: 44, // 44x44pt touch target (Rule)
    paddingVertical: 6,
    paddingRight: 12,
    marginBottom: 4,
  },
  backText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 15,
    color: 'rgba(255,255,255,0.80)',
    marginLeft: 2,
  },
  lineHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  lineColorBar: {
    width: 3,
    borderRadius: 2,
  },
  lineHeaderName: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },

  // ── Body ──────────────────────────────────────────────────────
  body: {
    paddingTop: 2,
    paddingBottom: 4,
  },
  branchLabel: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 20,
    color: '#FFFFFF',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  disruptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  disruptionLabel: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 13,
    color: STATUS_SEVERITY_COLORS.minor,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  disruptionReason: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 17,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginVertical: 12,
  },

  // ── Suggested route card (static dark glass — no live blur) ──
  suggestedRouteCard: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    marginBottom: 16,
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
    fontSize: 13.5,
    color: 'rgba(255,255,255,0.90)',
    lineHeight: 19,
    marginBottom: 8,
  },
  extraTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  extraTimeText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.50)',
  },

  // ── Unaffected ────────────────────────────────────────────────
  runningFineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 6,
  },
  runningFineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: STATUS_SEVERITY_COLORS.good,
  },
  runningFineLabel: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 13,
    color: STATUS_SEVERITY_COLORS.good,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  // ── Empty ─────────────────────────────────────────────────────
  emptyStateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  emptyStateText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 14.5,
    color: 'rgba(255,255,255,0.40)',
  },

  // ── Got it dismiss (Rule 33) ──────────────────────────────────
  gotItButton: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 26,
    minHeight: 44,
    paddingHorizontal: 28,
    paddingVertical: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
  },
  gotItButtonText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 14.5,
    color: 'rgba(255,255,255,0.80)',
    letterSpacing: 0.5,
  },

  // ── CTAs ──────────────────────────────────────────────────────
  ctaSection: {
    gap: 8,
    marginTop: 0,
  },
  primaryCta: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    minHeight: 48, // 44x44pt+ target
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryCtaText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 15.5,
    color: '#07103a',
  },
  secondaryCta: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 24,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
    paddingHorizontal: 16,
  },
  secondaryCtaText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 15.5,
    color: 'rgba(255,255,255,0.80)',
  },

  // ── Branch Grid ──────────────────────────────────────────────
  branchGridBody: {
    paddingVertical: 6,
  },
  branchGridTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 18,
    color: '#FFFFFF',
    marginBottom: 10,
  },
  branchGridRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  branchGridCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 9999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    gap: 10,
  },
  branchCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  branchStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  branchCardName: {
    flex: 1,
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 13,
    color: '#FFFFFF',
  },
  branchCardStatus: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 11,
    color: 'rgba(255,255,255,0.50)',
    letterSpacing: 0.3,
  },
  branchGridDismiss: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 24,
    marginTop: 4,
  },
  branchGridDismissText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 13.5,
    color: 'rgba(255,255,255,0.50)',
  },
});
