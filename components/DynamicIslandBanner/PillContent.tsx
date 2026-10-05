import React, { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import type { NotificationTier } from './interfaces/dynamic-notification.interface';

export interface PillContentProps {
  title: string;
  message: string;
  accent: string;
  tier?: NotificationTier;
  actionLabel?: string;
  stationCode?: string;
  shortLine?: string;
}

export function PillContent({
  title,
  message,
  accent,
  tier = 'standard',
  actionLabel,
  stationCode,
  shortLine,
}: PillContentProps): React.JSX.Element {
  useEffect(() => {
    const fullAnnounce = actionLabel
      ? `${title}. ${message}. Action: ${actionLabel}`
      : `${title}. ${message}`;
    AccessibilityInfo.announceForAccessibility(fullAnnounce);
  }, [title, message, actionLabel]);

  // Dev-time check for informational warning on compact/standard tiers
  useEffect(() => {
    if (__DEV__ && actionLabel && tier !== 'expanded') {
      console.warn(
        `[PillContent] actionLabel on '${tier}' tier renders as an inline specular link, not a full button — confirm this is intended.`,
      );
    }
  }, [actionLabel, tier]);

  // Extract short line code fallback if not explicitly provided
  const resolvedShortLine =
    shortLine || title.replace(/\s+(line|overground)$/i, '').trim();

  const isCompact = tier === 'compact';
  const isExpanded = tier === 'expanded';

  return (
    <View
      style={[
        styles.pill,
        isCompact && styles.pillCompact,
        tier === 'standard' && styles.pillStandard,
        isExpanded && styles.pillExpanded,
      ]}
      accessibilityRole="alert"
      accessibilityLabel={`${title}. ${message}${actionLabel ? `. ${actionLabel}` : ''}`}
    >
      {/* Header Row: Badge(s) + Title (+ Inline Link for Compact) */}
      <View style={styles.headerRow}>
        {/* Boarding Badge: Station + Line or Single Line Badge */}
        {stationCode ? (
          <View
            style={[
              styles.dualBadge,
              {
                borderColor: 'rgba(255, 255, 255, 0.22)',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
              },
            ]}
          >
            <Text
              style={styles.stationBadgeText}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {stationCode}
            </Text>
            <Text style={styles.badgeSeparator} maxFontSizeMultiplier={1.3}>
              ·
            </Text>
            <View style={[styles.pillBar, { backgroundColor: accent }]} />
            <Text
              style={[styles.pillBadgeText, { color: '#FFFFFF' }]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {resolvedShortLine}
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.pillBadge,
              {
                borderColor: accent,
                backgroundColor: `${accent}22`,
              },
            ]}
          >
            <View style={[styles.pillBar, { backgroundColor: accent }]} />
            <Text
              style={[styles.pillBadgeText, { color: '#FFFFFF' }]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {resolvedShortLine}
            </Text>
          </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    width: '100%',
    justifyContent: 'center',
  },
  pillCompact: {
    paddingVertical: 12,
  },
  pillStandard: {
    paddingVertical: 10,
    gap: 3,
  },
  pillExpanded: {
    paddingVertical: 8,
    gap: 4,
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
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  expandedActionText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 11,
    letterSpacing: 0.1,
  },
});

export default PillContent;
