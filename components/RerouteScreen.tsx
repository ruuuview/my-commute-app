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
 * PART 1 — DIRECTION GRID: for lines with >2 branches the sheet opens with an
 * ALWAYS-VISIBLE inline branch grid at the top (one step, not two). The tile
 * the direction engine resolved is pre-highlighted by source/confidence:
 *   • session/notification (high)  → emerald solid border + fill
 *   • history medium               → soft-orange (same rgba(255,149,0,0.20)
 *                                     token the old "Change" pill used)
 *   • pinned/manual or unresolved  → NO highlight (never assert confidence
 *                                     the engine doesn't have)
 * Tapping any tile re-targets the content + live-time fetch inline. Lines
 * with ≤2 branches (Jubilee, Lioness, …) skip the grid entirely — the
 * resolved branch renders directly, no ambiguity to confirm.
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

import React, { useEffect, useState } from 'react';
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
import { fetchLiveJourneyPenalty } from '../services/liveJourneyService';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BouncyPressable from './BouncyPressable';
import { BlurView } from 'expo-blur';
import { GLASS } from '../theme/colors';
import type { DetectionSource } from '../hooks/useAutoDetectBranch';

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
   * Lines with >2 entries render an ALWAYS-VISIBLE inline grid at the top of
   * the drawer; ≤2-branch lines skip the grid and render the resolved branch
   * directly (no ambiguity, no forced confirmation).
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
  /** TfL severity code for this line. Used to determine dot color in branch grid:
   *  unaffected → green, affected+minor(9,7) → amber, affected+severe/suspended(≤6) → red. */
  severity?: number;
  /**
   * The branch the direction engine resolved (useAutoDetectBranch) — the
   * pre-highlighted tile + the branch live-time is fetched for on open.
   */
  resolvedTerminus?: string;
  /** Source of the direction-engine resolution — drives highlight + caption. */
  resolvedSource?: DetectionSource;
  /** Confidence of the resolution — drives highlight strength. */
  resolvedConfidence?: 'high' | 'medium' | 'low';
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
  suggestedRoute,
  otherBranchName,
  googleMapsUrl = 'https://maps.google.com',
  citymapperUrl = 'citymapper://',
  stationId,
  severity,
  resolvedTerminus,
  resolvedSource,
  resolvedConfidence,
}: RerouteScreenProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  // ── Branch selection ────────────────────────────────────────────
  // internalBranch = the branch currently driving content + live fetch.
  // null = nothing selected yet → fall back to the dashboard-computed mode.
  const [internalBranch, setInternalBranch] = useState<string | null>(null);

  // On open (or when the engine's resolution arrives while nothing is tapped),
  // pre-select the resolved branch so the content below the grid and the live
  // fetch both target the pre-highlighted tile.
  useEffect(() => {
    if (!visible) return;
    if (resolvedTerminus && branches?.includes(resolvedTerminus)) {
      setInternalBranch(resolvedTerminus);
    } else {
      setInternalBranch(null);
    }
  }, [visible, resolvedTerminus, branches]);

  // The branch live-time is fetched for. Engine resolution wins; user tap wins
  // over everything; final fallback is the line's first branch (the same
  // default the dashboard's mode computation uses).
  const activeTerminus =
    internalBranch ||
    resolvedTerminus ||
    (branches && branches.length > 0 ? branches[0] : lineName);

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

  // ── Live TfL Journey Planner Calculation (Dynamic Real-Time Extra Time) ──
  // Fires for ONE branch only: the pre-highlighted (engine-resolved) tile on
  // open, then the tapped tile on tap. Never N simultaneous queries for a grid
  // nobody's going to fully explore.
  const [liveExtraTime, setLiveExtraTime] = useState<number | null>(null);
  const [isLiveResolving, setIsLiveResolving] = useState<boolean>(false);
  const [isLiveFallback, setIsLiveFallback] = useState<boolean>(false);

  useEffect(() => {
    if (!visible || !stationId || !activeTerminus) {
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
      destinationTerminus: activeTerminus,
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
  }, [visible, stationId, activeTerminus, lineId]);

  // effectiveMode drives affected/unaffected/empty content below the grid.
  // When a tile is selected its own branchStatus wins; otherwise the
  // dashboard-computed mode (which used the line's default branch).
  const effectiveMode = internalBranch && branchStatuses
    ? (branchStatuses[internalBranch] === 'affected' ? 'affected' : 'unaffected')
    : mode;

  // ── Pre-highlight tier from the direction engine ────────────────
  // high (session / notification / strong history pattern) → emerald solid.
  // medium (history with weak pattern) → soft-orange (old "Change" pill token).
  // none (pinned/manual fallthrough, or nothing resolved) → neutral grid.
  // The UI must never assert confidence the engine doesn't have.
  const highlightTier: 'high' | 'medium' | 'none' = (() => {
    if (!resolvedTerminus || !resolvedSource) return 'none';
    if (resolvedSource === 'session' || resolvedSource === 'notification') return 'high';
    if (resolvedSource === 'history') return resolvedConfidence === 'high' ? 'high' : 'medium';
    return 'none';
  })();

  const highlightCaption =
    highlightTier === 'none'
      ? null
      : resolvedSource === 'session'
        ? 'Active now'
        : resolvedSource === 'notification'
          ? 'From your last tap'
          : 'Usual route';

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

  // ── Tile tap: re-target inline (no grid↔detail navigation anymore).
  // Setting internalBranch changes activeTerminus, which re-fires the live
  // fetch effect for the tapped branch — the same re-trigger the old
  // "Change" button used, now wired to grid taps.
  const handleBranchTap = (branch: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setInternalBranch(branch);
    setLiveExtraTime(null);
    setIsLiveResolving(true);
  };

  // ── Back handler: with the grid inline there's no second step to return
  // from — Back always closes the drawer.
  const handleBack = () => {
    onClose();
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

  // ── Inline branch grid — ALWAYS visible at the top of the drawer for
  // multi-branch lines. No hidden second step, no "Change" button: the
  // resolution is shown up front, and tapping a tile swaps the content below.
  const renderBranchGrid = () => {
    if (!branches || branches.length <= 2) return null;
    // Split branches into pairs for rows (2x2 for 4-branch lines)
    const rows: string[][] = [];
    for (let i = 0; i < branches.length; i += 2) {
      rows.push(branches.slice(i, i + 2));
    }

    return (
      <View style={s.branchGridBody}>
        {/* Static header — line name only, no terminus asserted in copy */}
        <Text style={s.branchGridTitle}>
          {`${lineName.replace(/\s*line\s*$/i, '').trim()} — where are you headed?`}
        </Text>
        {rows.map((row, ri) => (
          <View key={ri} style={s.branchGridRow}>
            {row.map((branch) => {
              const status = branchStatuses?.[branch];
              const isAffected = status === 'affected';
              const isHighlighted = highlightTier !== 'none' && branch === resolvedTerminus;
              return (
                <Pressable
                  key={branch}
                  style={[
                    s.branchGridCard,
                    isHighlighted && highlightTier === 'high' && s.branchGridCardEmerald,
                    isHighlighted && highlightTier === 'medium' && s.branchGridCardOrange,
                  ]}
                  onPress={() => handleBranchTap(branch)}
                  accessibilityRole="button"
                  accessibilityLabel={`${branch} branch`}
                  accessibilityState={{ selected: isHighlighted }}
                >
                  <Text
                    style={[
                      s.branchCardName,
                      isHighlighted && highlightTier === 'medium' && { color: '#FF9500' },
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
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
        {/* Source caption — under the highlighted tile ONLY */}
        {highlightCaption && (
          <View style={s.branchGridCaptionRow}>
            <View
              style={[
                s.branchGridCaptionDot,
                { backgroundColor: highlightTier === 'high' ? STATUS_SEVERITY_COLORS.good : '#FF9500' },
              ]}
            />
            <Text style={s.branchGridCaption}>{highlightCaption}</Text>
          </View>
        )}
      </View>
    );
  };

  const renderAffectedState = () => (
    <View style={s.body}>
      {/* Disrupted badge — reason lives one tap away in LineDetailModal */}
      <View style={s.disruptionRow}>
        <ICON.signalFail size={15} color={STATUS_SEVERITY_COLORS.minor} />
        <Text style={s.disruptionLabel}>Disrupted</Text>
      </View>

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

  // Lines with ≤2 real directions (Jubilee, Lioness, …) skip the grid entirely:
  // no ambiguity, no reason to confirm the obvious. Resolved branch renders
  // directly. The header question is part of the grid, so it's skipped too.
  const hasGrid = Boolean(branches && branches.length > 2);

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

            {/* Inline, permanently-visible grid — the entire point of
                "one step not two". */}
            {hasGrid && renderBranchGrid()}

            {effectiveMode === 'affected'
              ? renderAffectedState()
              : effectiveMode === 'unaffected'
                ? renderUnaffectedState()
                : renderEmptyState()}
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
  disruptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
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

  // ── Branch Grid (inline, always visible) ─────────────────────
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
  // High confidence (session/notification/strong history) — emerald solid.
  branchGridCardEmerald: {
    borderWidth: 2,
    borderColor: STATUS_SEVERITY_COLORS.good,
    backgroundColor: 'rgba(48,209,88,0.12)',
  },
  // Medium confidence (weak history pattern) — soft-orange, the exact
  // rgba(255,149,0,0.20) token the old "Change" pill used.
  branchGridCardOrange: {
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.45)',
    backgroundColor: 'rgba(255,149,0,0.20)',
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
  // Source caption — under the highlighted tile ONLY
  branchGridCaptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    marginBottom: 6,
    paddingLeft: 6,
  },
  branchGridCaptionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  branchGridCaption: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.3,
  },
});
