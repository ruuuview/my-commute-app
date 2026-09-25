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

import React, { useEffect, useState, useRef } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  Linking,
  ScrollView,
  useWindowDimensions,
  Platform,
  PanResponder,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  useReducedMotion,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BouncyPressable from './BouncyPressable';
import { BlurView } from 'expo-blur';
import { GLASS } from '../theme/colors';
import { NORTHERN_SHADES } from '../constants/lineColors';
import type { DetectionSource } from '../hooks/useAutoDetectBranch';
import { CaretLeft, Warning, MapTrifold, MapPinLine, CheckCircle } from 'phosphor-react-native';
import { STATUS_SEVERITY_COLORS, getSeverityColor } from '../utils/getSeverityColor';
import { StatusBezel } from './StatusBezel';
import { getBranchSuggestedRoute, buildRerouteLinks } from './rerouteHelpers';
import { SCREEN_PADDING } from '../constants/layout';

// ─── Canonical TfL status display strings ─────────────────────────
const TFL_STATUS_DISPLAY: Record<'good' | 'minor' | 'severe', string> = {
  good: 'Good service',
  minor: 'Minor delays',
  severe: 'Severe delays',
};

// ICON mapping — maps semantic names to Phosphor components.
const ICON = {
  back: CaretLeft,
  signalFail: Warning,
  googleMaps: MapTrifold,
  citymapper: MapPinLine,
  fine: CheckCircle,
} as const;

// ─── Types ────────────────────────────────────────────────────────

export type RerouteMode = 'affected' | 'unaffected' | 'empty';

export interface RerouteScreenProps {
  visible: boolean;
  onClose: () => void;
  branches?: string[];
  branchStatuses?: Record<string, 'affected' | 'unaffected'>;
  mode: RerouteMode;
  lineId: string;
  lineName: string;
  lineColor: string;
  suggestedRoute?: {
    description: string;
    extraTimeMinutes: number;
  };
  otherBranchName?: string;
  googleMapsUrl?: string;
  citymapperUrl?: string;
  stationId?: string;
  severity?: number;
  resolvedTerminus?: string;
  resolvedSource?: DetectionSource;
  resolvedConfidence?: 'high' | 'medium' | 'low';
  initialSection?: 'overview' | 'alternatives';
  isCleared?: boolean;
}

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
  initialSection = 'overview',
  isCleared = false,
}: RerouteScreenProps) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  const [internalBranch, setInternalBranch] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    if (resolvedTerminus && branches?.includes(resolvedTerminus)) {
      setInternalBranch(resolvedTerminus);
    } else {
      setInternalBranch(null);
    }
  }, [visible, resolvedTerminus, branches]);

  const activeTerminus =
    internalBranch ||
    resolvedTerminus ||
    (branches && branches.length > 0 ? branches[0] : lineName);

  const resolvedSuggestedRoute = getBranchSuggestedRoute(
    lineId,
    activeTerminus,
    suggestedRoute
  );

  const sheetMaxHeight = Math.min(
    screenHeight * 0.85,
    Math.max(screenHeight - insets.top - insets.bottom, screenHeight * 0.5)
  );

  const translateY = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = 0;
    }
  }, [visible, translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 2,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.value = gestureState.dy;
        } else {
          translateY.value = gestureState.dy * 0.15;
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 20 || gestureState.vy > 0.1) {
          translateY.value = withTiming(sheetMaxHeight || 600, { duration: 160 }, (finished) => {
            if (finished) {
              runOnJS(onClose)();
            }
          });
        } else {
          translateY.value = withSpring(0, { damping: 22, stiffness: 300, mass: 0.8 });
        }
      },
    })
  ).current;

  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const prevVisible = React.useRef(visible);
  useEffect(() => {
    if (visible && !prevVisible.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
    } else if (!visible && prevVisible.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
    }
    prevVisible.current = visible;
  }, [visible]);

  const effectiveMode = internalBranch && branchStatuses
    ? (branchStatuses[internalBranch] === 'affected' ? 'affected' : 'unaffected')
    : mode;

  const highlightTier: 'high' | 'medium' | 'none' = (() => {
    if (!resolvedTerminus || !resolvedSource) return 'none';
    if (resolvedSource === 'session' || resolvedSource === 'notification') return 'high';
    if (resolvedSource === 'history') return resolvedConfidence === 'high' ? 'high' : 'medium';
    if (resolvedSource === 'pinned') return 'high';
    if (resolvedSource === 'manual') return 'medium';
    return 'none';
  })();

  const highlightCaption =
    highlightTier === 'none' || resolvedSource === 'manual'
      ? null
      : resolvedSource === 'session'
        ? 'Active now'
        : resolvedSource === 'notification'
          ? 'From your last tap'
          : 'Usual route';

  const dynamicLinks = buildRerouteLinks(activeTerminus);
  const effectiveGoogleMapsUrl = internalBranch ? dynamicLinks.googleMapsUrl : (googleMapsUrl || dynamicLinks.googleMapsUrl);
  const effectiveCitymapperUrl = internalBranch ? dynamicLinks.citymapperUrl : (citymapperUrl || dynamicLinks.citymapperUrl);

  const handleOpenGoogleMaps = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
    Linking.openURL(effectiveGoogleMapsUrl).catch(() => { });
    onClose();
  };

  const handleOpenCitymapper = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
    Linking.openURL(effectiveCitymapperUrl).catch(() => {
      const webUrl = effectiveCitymapperUrl.replace(/^citymapper:\/\//, 'https://citymapper.com/');
      Linking.openURL(webUrl).catch(() => { });
    });
    onClose();
  };

  const handleBranchTap = (branch: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
    setInternalBranch(branch);
  };

  const renderHeader = () => (
    <>
      <View style={s.dragHandleWrap} {...panResponder.panHandlers}>
        <View style={s.dragHandle} />
      </View>

      <View style={s.headerRow}>
        <View style={s.lineTitleGroup} {...panResponder.panHandlers}>
          <View
            style={[
              s.lineColorBar,
              { backgroundColor: lineColor },
              (lineId === 'northern' || lineColor === '#000000') && {
                borderWidth: 0.5,
                borderColor: NORTHERN_SHADES.highlightBorder,
              },
            ]}
          />
          <Text style={s.lineHeaderName} numberOfLines={1}>{lineName}</Text>
        </View>

        <Pressable
          onPress={onClose}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={s.backPill}
          accessibilityLabel="Back, close reroute"
          accessibilityRole="button"
        >
          <Text style={s.backText}>Back</Text>
        </Pressable>
      </View>

      {isCleared && (
        <View style={s.clearedBadge}>
          <StatusBezel statusType="good" />
          <Text style={s.clearedText}>
            Disruption resolved — Good service resumed
          </Text>
        </View>
      )}
    </>
  );

  const renderBranchGrid = () => {
    if (!branches || branches.length < 2) return null;

    return (
      <View style={s.branchGridBody}>
        <Text style={s.branchGridTitle}>
          Where are you headed?
        </Text>

        <View style={s.branchGridContainer}>
          {branches.map((branch) => {
            const status = branchStatuses?.[branch];
            const isAffected = status === 'affected';
            const isHighlighted = branch === activeTerminus;
            const activeTier = branch === resolvedTerminus ? highlightTier : 'high';
            const severityResult = isAffected
              ? getSeverityColor(severity)
              : { color: STATUS_SEVERITY_COLORS.good, label: 'good' as const };
            const cleanName = branch.replace(/\s*branch\s*$/i, '').trim();

            return (
              <Pressable
                key={branch}
                style={({ pressed }) => [
                  s.branchCard,
                  isHighlighted && activeTier === 'high' && s.branchCardSelected,
                  isHighlighted && activeTier === 'medium' && s.branchCardMedium,
                  pressed && { opacity: 0.65 },
                ]}
                onPress={() => handleBranchTap(branch)}
                accessibilityRole="button"
                accessibilityLabel={`${cleanName}, ${TFL_STATUS_DISPLAY[severityResult.label]}`}
                accessibilityState={{ selected: isHighlighted }}
              >
                <View style={s.branchCardContent}>
                  <Text
                    style={s.branchCardName}
                    numberOfLines={1}
                    adjustsFontSizeToFit={true}
                    minimumFontScale={0.75}
                  >
                    {cleanName}
                  </Text>

                  <View style={s.branchPillRow}>
                    <View
                      style={[
                        s.compactPillItem,
                        { borderColor: `${severityResult.color}4D` },
                      ]}
                    >
                      <View
                        style={[
                          s.compactPillColorLayer,
                          { backgroundColor: `${severityResult.color}15` },
                        ]}
                      />
                      <Text
                        style={[
                          s.compactPillText,
                          { color: severityResult.color },
                        ]}
                        numberOfLines={1}
                      >
                        {TFL_STATUS_DISPLAY[severityResult.label]}
                      </Text>
                    </View>
                    <StatusBezel statusType={severityResult.label} />
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>

        {highlightCaption && activeTerminus === resolvedTerminus && (
          <View style={s.branchGridCaptionRow}>
            <View
              style={[
                s.branchGridCaptionDot,
                { backgroundColor: 'rgba(255,255,255,0.7)' },
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
      {resolvedSuggestedRoute && (
        <View style={s.suggestedRouteCard}>
          <View style={s.suggestedRouteHeaderPill}>
            <Text style={s.suggestedRouteHeaderText}>Suggested route</Text>
          </View>
          <Text style={s.suggestedRouteDesc}>
            {resolvedSuggestedRoute.description}
          </Text>
        </View>
      )}

      <View style={s.ctaSection}>
        <BouncyPressable
          onPress={handleOpenGoogleMaps}
          style={s.primaryCta}
        >
          <ICON.googleMaps
            size={15}
            color="#07103a"
            style={{ marginRight: 6 }}
          />
          <Text style={s.primaryCtaText} numberOfLines={1}>
            Google Maps
          </Text>
        </BouncyPressable>

        <BouncyPressable
          onPress={handleOpenCitymapper}
          style={s.secondaryCta}
        >
          <ICON.citymapper
            size={15}
            color="rgba(255,255,255,0.85)"
            style={{ marginRight: 6 }}
          />
          <Text style={s.secondaryCtaText} numberOfLines={1}>
            Citymapper
          </Text>
        </BouncyPressable>
      </View>
    </View>
  );

  const renderUnaffectedState = () => (
    <View style={s.body}>
      <View style={s.unaffectedCard}>
        <View style={s.unaffectedAccentBar} />
        <View style={s.unaffectedCardInner}>
          <View style={s.runningFineRow}>
            <StatusBezel statusType="good" />
            <Text style={s.runningFineLabel}>Good service — no action needed</Text>
          </View>

          <Text style={s.disruptionReason} numberOfLines={3} ellipsizeMode="tail">
            {otherBranchName
              ? `The disruption is on the ${otherBranchName.replace(/\s*branch\s*$/i, '').trim()} branch, not yours.`
              : 'The disruption does not affect your route.'}
          </Text>
        </View>
      </View>

      <BouncyPressable onPress={onClose} style={s.gotItButton}>
        <Text style={s.gotItButtonText}>Got it</Text>
      </BouncyPressable>
    </View>
  );

  const renderEmptyState = () => (
    <View style={s.body}>
      <View style={s.emptyStateRow}>
        <ICON.fine size={22} color="rgba(255,255,255,0.35)" />
        <Text style={s.emptyStateText}>No impact on your usual routes.</Text>
      </View>
    </View>
  );

  const hasGrid = Boolean(branches && branches.length >= 2);

  return (
    <Modal
      visible={visible}
      transparent={true}
      presentationStyle="overFullScreen"
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={s.root}>
        <Pressable
          style={s.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss reroute screen"
        />

        <Animated.View style={[s.sheet, { maxHeight: sheetMaxHeight }, sheetAnimStyle]}>
          <BlurView intensity={GLASS.blurIntensity} tint={GLASS.blurTint} style={StyleSheet.absoluteFill} pointerEvents="none" />

          {/* Top fixed gesture handle & header outside scrollview */}
          <View style={s.topBarArea} {...panResponder.panHandlers}>
            {renderHeader()}
          </View>

          <ScrollView
            style={s.scroll}
            contentContainerStyle={[
              s.scrollContent,
              { paddingBottom: insets.bottom + 24 },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {hasGrid && renderBranchGrid()}

            {!hasGrid && branches && branches.length > 0 && (
              <View style={s.twoBranchRow}>
                {branches.slice(0, 2).map((b) => {
                  const isSelected = b === activeTerminus;
                  return (
                    <Pressable
                      key={b}
                      onPress={() => {
                        setInternalBranch(b);
                        Haptics.selectionAsync().catch(() => { });
                      }}
                      style={[
                        s.twoBranchChip,
                        isSelected && s.twoBranchChipSelected,
                      ]}
                    >
                      <View style={[s.twoBranchDot, isSelected && s.twoBranchDotSelected]} />
                      <Text
                        style={[
                          s.twoBranchText,
                          isSelected && s.twoBranchTextSelected,
                        ]}
                        numberOfLines={1}
                        adjustsFontSizeToFit={true}
                        minimumFontScale={0.75}
                      >
                        Towards {b.replace(/\s*branch\s*$/i, '').trim()}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {effectiveMode === 'affected'
              ? renderAffectedState()
              : effectiveMode === 'unaffected'
                ? renderUnaffectedState()
                : renderEmptyState()}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    borderTopWidth: GLASS.borderWidth,
    borderLeftWidth: GLASS.borderWidth,
    borderRightWidth: GLASS.borderWidth,
    borderColor: GLASS.borderColor,
    borderTopColor: GLASS.borderTop,
  },
  topBarArea: {
    paddingHorizontal: SCREEN_PADDING,
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: SCREEN_PADDING,
  },
  dragHandleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 12,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    width: '100%',
  },
  lineTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 12,
  },
  lineColorBar: {
    width: 3.5,
    height: 22,
    borderRadius: 2,
  },
  lineHeaderName: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 22,
    color: '#FFFFFF',
    letterSpacing: -0.8,
  },
  backPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: GLASS.borderWidth,
    borderColor: GLASS.borderColor,
    borderTopColor: GLASS.borderTop,
    borderBottomColor: GLASS.borderBottom,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  backText: {
    fontSize: 14,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: 'rgba(255, 255, 255, 0.80)',
  },
  clearedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(52, 199, 89, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.4)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
  },
  clearedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#34C759',
    fontFamily: 'SpaceGrotesk_600SemiBold',
  },

  // ── Body ──────────────────────────────────────────────────────
  body: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  disruptionReason: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 17,
  },

  // ── Suggested route card ───────────────────────────────────────
  suggestedRouteCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: GLASS.borderWidth,
    borderColor: GLASS.borderColor,
    borderTopColor: GLASS.borderTop,
    borderBottomColor: GLASS.borderBottom,
    backgroundColor: GLASS.background,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 14,
  },
  suggestedRouteHeaderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.20)',
    borderTopColor: 'rgba(255, 255, 255, 0.35)',
    borderBottomColor: 'rgba(255, 255, 255, 0.10)',
    paddingVertical: 3.5,
    paddingHorizontal: 9.5,
    borderRadius: 9999,
    marginBottom: 8,
  },
  suggestedRouteHeaderText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  suggestedRouteDesc: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 13.5,
    color: 'rgba(255,255,255,0.90)',
    lineHeight: 19,
  },

  // ── Unaffected ────────────────────────────────────────────────
  unaffectedCard: {
    flexDirection: 'row',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: GLASS.borderWidth,
    borderColor: GLASS.borderColor,
    borderTopColor: GLASS.borderTop,
    borderBottomColor: GLASS.borderBottom,
    backgroundColor: GLASS.background,
    marginBottom: 4,
  },
  unaffectedAccentBar: {
    width: 3.5,
    backgroundColor: '#34D399',
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  unaffectedCardInner: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  runningFineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 6,
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

  // ── Got it dismiss ───────────────────────────────────────────
  gotItButton: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    minHeight: 38,
    paddingHorizontal: 24,
    paddingVertical: 8,
    marginTop: 12,
    borderWidth: GLASS.borderWidth,
    borderColor: GLASS.borderColor,
  },
  gotItButtonText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 14,
    color: 'rgba(255,255,255,0.80)',
    letterSpacing: 0.3,
  },

  // ── CTAs (Compact row, not full width) ────────────────────────
  ctaSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 6,
    marginBottom: 10,
  },
  primaryCta: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  primaryCtaText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 13,
    color: '#07103a',
  },
  secondaryCta: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 20,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: GLASS.borderWidth,
    borderColor: GLASS.borderColor,
    borderTopColor: GLASS.borderTop,
    borderBottomColor: GLASS.borderBottom,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  secondaryCtaText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.85)',
  },

  // ── Branch Grid ───────────────────────────────────────────────
  branchGridBody: {
    paddingVertical: 4,
    marginBottom: 8,
  },
  branchGridTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 10,
    letterSpacing: -0.2,
  },
  branchGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  branchCard: {
    width: '48.5%',
    borderRadius: 14,
    borderWidth: GLASS.borderWidth,
    borderColor: GLASS.borderColor,
    borderTopColor: GLASS.borderTop,
    borderBottomColor: GLASS.borderBottom,
    backgroundColor: GLASS.background,
    overflow: 'hidden',
    minHeight: 58,
    marginBottom: 2,
  },
  branchCardSelected: {
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    borderTopColor: '#FFFFFF',
    borderBottomColor: '#FFFFFF',
    borderLeftColor: '#FFFFFF',
    borderRightColor: '#FFFFFF',
    backgroundColor: GLASS.background,
  },
  branchCardMedium: {
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.60)',
    borderTopColor: 'rgba(255, 255, 255, 0.60)',
    borderBottomColor: 'rgba(255, 255, 255, 0.60)',
    borderLeftColor: 'rgba(255, 255, 255, 0.60)',
    borderRightColor: 'rgba(255, 255, 255, 0.60)',
    backgroundColor: GLASS.background,
  },
  branchCardContent: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    gap: 6,
    justifyContent: 'center',
  },
  branchCardName: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.95)',
  },
  branchPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  compactPillItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    position: 'relative',
    flexShrink: 1,
  },
  compactPillColorLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  compactPillText: {
    fontSize: 9.5,
    fontWeight: '600',
    fontFamily: 'SpaceGrotesk_600SemiBold',
  },
  branchGridCaptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    marginBottom: 4,
    paddingLeft: 4,
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

  // ── Two-branch destination selector ───────────────────────────
  twoBranchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  twoBranchChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: GLASS.background,
    borderWidth: GLASS.borderWidth,
    borderColor: GLASS.borderColor,
    borderTopColor: GLASS.borderTop,
    borderBottomColor: GLASS.borderBottom,
  },
  twoBranchChipSelected: {
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
    borderColor: '#10B981',
  },
  twoBranchDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  twoBranchDotSelected: {
    backgroundColor: '#10B981',
  },
  twoBranchText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.65)',
  },
  twoBranchTextSelected: {
    color: '#FFFFFF',
    fontFamily: 'SpaceGrotesk_700Bold',
  },
});


