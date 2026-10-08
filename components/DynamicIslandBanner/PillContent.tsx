import React, { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { SymbolViewProps } from 'expo-symbols';
import type { NotificationTier } from './interfaces/dynamic-notification.interface';
import { LINE_IDENTITY_COLORS } from '../../constants/lineColors';

export interface PillContentProps {
  title: string;
  message: string;
  accent: string;
  tier?: NotificationTier;
  actionLabel?: string;
  stationCode?: string;
  shortLine?: string;
  lines?: string[];
  /**
   * Primer key for the bilateral permission-primer layout. PillBridge forwards
   * it derived from the pill id (`primer-<key>`). When omitted, PillContent
   * derives primer-ness from shortLine === 'ALERTS' (the stable tag
   * usePrimerPill.ts puts on primer requests) and resolves the icon from the
   * PRIMER_COPY titles as a fallback.
   */
  primerKey?: 'locationAlways' | 'notifications';
}

export function PillContent({
  title,
  message,
  accent,
  tier = 'standard',
  actionLabel,
  stationCode,
  shortLine,
  lines,
  primerKey,
}: PillContentProps): React.JSX.Element {
  // Primer detection FIRST: the dev-warning effect below reads isPrimer in
  // its dependency array, so this must be initialized before any effect runs.
  // usePrimerPill.ts is the sole producer of primer pills and tags every
  // primer request shortLine: 'ALERTS'. The bilateral layout below renders
  // only for primers; every other kind keeps the legacy layout.
  const isPrimer = primerKey !== undefined || shortLine === 'ALERTS';
  // Icon resolution: 'locationAlways' → location.fill, 'notifications' →
  // bell.badge.fill. The primerKey prop (threaded by PillBridge) is the
  // deterministic path; the title fallback below only fires if it is absent.
  const resolvedPrimerKey: 'locationAlways' | 'notifications' =
    primerKey ??
    (title === 'Live commute tracking' ? 'locationAlways' : 'notifications');
  const primerSymbol: SymbolViewProps['name'] =
    resolvedPrimerKey === 'locationAlways' ? 'location.fill' : 'bell.badge.fill';

  useEffect(() => {
    const fullAnnounce = actionLabel
      ? `${title}. ${message}. Action: ${actionLabel}`
      : `${title}. ${message}`;
    AccessibilityInfo.announceForAccessibility(fullAnnounce);
  }, [title, message, actionLabel]);

  // Dev-time check for informational warning on compact/standard tiers.
  // Primers are exempt: their chip is a dedicated specular button by design.
  useEffect(() => {
    if (__DEV__ && actionLabel && tier !== 'expanded' && !isPrimer) {
      console.warn(
        `[PillContent] actionLabel on '${tier}' tier renders as an inline specular link, not a full button — confirm this is intended.`,
      );
    }
  }, [actionLabel, tier, isPrimer]);

  // Extract short line code fallback if not explicitly provided
  const resolvedShortLine =
    shortLine || title.replace(/\s+(line|overground)$/i, '').trim();
  const normalizedLine = (resolvedShortLine || '').toLowerCase().replace(/[\s_&]/g, '-').replace(/-line$/, '');
  const lineColor =
    LINE_IDENTITY_COLORS[normalizedLine] ??
    LINE_IDENTITY_COLORS[resolvedShortLine.toLowerCase()] ??
    (accent !== '#30D158' && accent !== '#FFFFFF' ? accent : '#0098D4');
  const isNorthern = normalizedLine === 'northern' || lineColor === '#000000';

  const isCompact = tier === 'compact';
  const isExpanded = tier === 'expanded';

  const multiLines = lines && lines.length > 0 ? lines : null;
  const visibleLines = multiLines ? multiLines.slice(0, 2) : null;

  return (
    <View
      style={[
        styles.pill,
        isCompact && styles.pillCompact,
        tier === 'standard' && styles.pillStandard,
        isExpanded && styles.pillExpanded,
        isPrimer && styles.primerPill,
      ]}
      accessibilityRole="alert"
      accessibilityLabel={`${title}. ${message}${actionLabel ? `. ${actionLabel}` : ''}`}
    >
      {isPrimer ? (
        <>
          {/* Primer bilateral layout: icon + title + action chip / subtitle.
              The chip is a visual affordance — the tap is handled at pill level
              by the shell (PillBridge trigger onPress → onAction ?? onPress),
              so the whole pill surface is the 44pt touch target. */}
          <View style={styles.primerTopRow}>
            <View style={styles.primerIconSlot}>
              <SymbolView
                name={primerSymbol}
                size={19}
                tintColor="#38BDF8"
                weight="semibold"
                fallback={null}
              />
              <View style={styles.primerDot} />
            </View>
            <Text
              style={styles.primerTitle}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {title}
            </Text>
            <View style={styles.primerChip}>
              <Text
                style={styles.primerChipText}
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
              >
                {actionLabel ?? 'Enable'} →
              </Text>
            </View>
          </View>
          <Text
            style={styles.primerSubtitle}
            numberOfLines={2}
            ellipsizeMode="tail"
            maxFontSizeMultiplier={1.3}
          >
            {message}
          </Text>
        </>
      ) : (
        <>
      {/* Header Row: Badge(s) + Title (+ Inline Link for Compact) */}
      <View style={styles.headerRow}>
        {/* Multi-Line Bars or Station Bar or Single Line Straight Bar */}
        {visibleLines ? (
          <View style={styles.multiLineContainer}>
            {visibleLines.map((line) => {
              const lKey = line.toLowerCase().replace(/[\s_&]/g, '-').replace(/-line$/, '');
              const lColor = LINE_IDENTITY_COLORS[lKey] ?? LINE_IDENTITY_COLORS[line.toLowerCase()] ?? accent;
              const isLNorthern = lKey === 'northern' || lColor === '#000000';
              return (
                <View
                  key={line}
                  style={[
                    styles.straightLineBar,
                    { backgroundColor: lColor, marginRight: 5 },
                    isLNorthern && styles.straightLineBarNorthern,
                  ]}
                />
              );
            })}
          </View>
        ) : stationCode ? (
          <View style={styles.stationCodeSlot}>
            <Text style={styles.stationBadgeText}>{stationCode}</Text>
            <View
              style={[
                styles.straightLineBar,
                { backgroundColor: lineColor, marginLeft: 6 },
                isNorthern && styles.straightLineBarNorthern,
              ]}
            />
          </View>
        ) : (
          <View
            style={[
              styles.straightLineBar,
              { backgroundColor: lineColor },
              isNorthern && styles.straightLineBarNorthern,
            ]}
          />
        )}

        {/* Title / Status */}
        <Text
          style={styles.title}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
        >
          {title}
        </Text>

        {/* Compact Tier Inline Action */}
        {isCompact && actionLabel ? (
          <Text
            style={styles.inlineActionLink}
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
          >
            {actionLabel} →
          </Text>
        ) : null}
      </View>

      {/* Standard & Expanded: Message Row */}
      {!isCompact && (
        <View style={styles.messageRow}>
          <Text
            style={styles.message}
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
          >
            {message}
          </Text>
          {/* Standard Tier Inline Action Link */}
          {tier === 'standard' && actionLabel ? (
            <Text
              style={styles.inlineActionLink}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              · {actionLabel} →
            </Text>
          ) : null}
        </View>
      )}

      {/* Expanded Tier: Dedicated Action Pill Row */}
      {isExpanded && actionLabel ? (
        <View style={styles.expandedActionRow}>
          <View
            style={[
              styles.expandedActionButton,
              {
                borderColor: `${accent}66`,
                backgroundColor: `${accent}22`,
              },
            ]}
          >
            <Text
              style={styles.expandedActionText}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {actionLabel} →
            </Text>
          </View>
        </View>
      ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
  },
  // Primer container override: optical clearance from the curved corners and
  // the LiquidGlassRim. Applied after the tier styles so it wins. The glass
  // itself stays untouched — transparent, no fills, no scrims.
  primerPill: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    gap: 4,
    // Fill the fixed-height glass card so justifyContent: 'center' (from
    // styles.pill) actually centers the content instead of hugging the top.
    height: '100%',
    justifyContent: 'center',
  },
  primerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  primerIconSlot: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  primerDot: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#38BDF8',
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
  primerTitle: {
    flex: 1,
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 13.5,
    color: '#FFFFFF',
    letterSpacing: -0.2,
    marginRight: 10,
  },
  primerChip: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
  },
  primerChipText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 11.5,
    color: '#38BDF8',
    letterSpacing: -0.1,
  },
  // Indented to align with the title's text start (icon slot 24 + gap 8),
  // not the icon itself.
  primerSubtitle: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 11.5,
    color: 'rgba(255, 255, 255, 0.82)',
    lineHeight: 15,
    marginLeft: 32,
  },
  pillCompact: {
    paddingVertical: 12,
    justifyContent: 'center',
  },
  pillStandard: {
    paddingVertical: 10,
    gap: 3,
    justifyContent: 'center',
  },
  pillExpanded: {
    paddingVertical: 8,
    gap: 4,
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  pillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginRight: 10,
    gap: 4,
    maxWidth: 120,
  },
  dualBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginRight: 10,
    gap: 4,
    maxWidth: 120,
  },
  straightLineBar: {
    width: 3.5,
    height: 15,
    borderRadius: 2,
    marginRight: 9,
  },
  straightLineBarNorthern: {
    borderWidth: 0.75,
    borderColor: 'rgba(255, 255, 255, 0.45)',
  },
  stationCodeSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  stationBadgeText: {
    fontSize: 10,
    fontFamily: 'SpaceGrotesk_700Bold',
    letterSpacing: 0.2,
    color: '#FFFFFF',
  },
  badgeSeparator: {
    fontSize: 10,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  pillBar: {
    width: 2.5,
    height: 10,
    borderRadius: 1,
  },
  pillBadgeText: {
    fontSize: 10,
    fontFamily: 'SpaceGrotesk_700Bold',
    letterSpacing: 0.2,
  },
  title: {
    flex: 1,
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 4,
  },
  message: {
    flex: 1,
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  inlineActionLink: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 12,
    color: '#38BDF8',
    letterSpacing: -0.1,
  },
  expandedActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  expandedActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  expandedActionText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 11,
    letterSpacing: 0.1,
  },
  multiLineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 8,
  },
  overflowBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overflowText: {
    fontSize: 9,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: 'rgba(255, 255, 255, 0.65)',
  },
});

export default PillContent;
