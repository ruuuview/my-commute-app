// components/refunds/ActiveClaimHeroCard.tsx
// Radar v2 State B hero — amber action-required claim terminal card.
// Banner (ELIGIBLE + countdown), route block, SJT-vs-Actual evidence accordion,
// multi-claim pagination, optimistic filing state, dismissal.
// Architecture: plain View owns ALL layout; BlurView is background-only
// (UIVisualEffectView ignores layout caps when used as a container — iOS bug).

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import {
  CaretDown,
  CaretUp,
  Clock,
  ArrowRight,
  CaretLeft,
  CaretRight,
  ArrowSquareOut,
  Lightning,
} from 'phosphor-react-native';
import {
  RadarClaim,
  daysLeftUntil,
} from '../../components/refunds/types';
import { formatPence } from '../../services/refundSlaService';
import { FARE_DISCLAIMER } from '../../theme/radarTheme';

export interface ActiveClaimHeroCardProps {
  claim: RadarClaim;
  index: number;
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
  onFile: (id: number) => void;
  onDismiss: (id: number) => void;
  onOpenPortal: () => void;
  filing?: boolean;
  locallyFiledAtMs?: number | null;
}

const ActiveClaimHeroCard: React.FC<ActiveClaimHeroCardProps> = ({
  claim,
  index,
  total,
  onPrev,
  onNext,
  onFile,
  onDismiss,
  onOpenPortal,
  filing,
  locallyFiledAtMs,
}) => {
  const [expanded, setExpanded] = useState(false);

  const daysLeft = daysLeftUntil(claim.expiresAt);
  const expiresText = daysLeft === 0 ? 'Expires today' : `${daysLeft}d left`;

  const toggleExpand = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpanded((s) => !s);
  };

  const scheduledTime = claim.entryTime
    ? new Date(claim.entryTime).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
  const actualTime = claim.exitTime
    ? new Date(claim.exitTime).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  return (
    <View style={styles.outer}>
      <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
      <View style={styles.content}>
        {/* Banner row: ELIGIBLE badge + countdown chip */}
        <View style={styles.bannerRow}>
          <View style={styles.bannerBadge}>
            <Lightning size={13} color="#F59E0B" weight="fill" />
            <Text style={styles.bannerText}>ELIGIBLE FOR ESTIMATED REFUND</Text>
          </View>
          <View style={styles.countdownChip}>
            <Clock size={12} color="#F59E0B" />
            <Text style={styles.countdownText}>{expiresText}</Text>
          </View>
        </View>

        {/* Route block */}
        <View style={styles.routeBlock}>
          <ArrowRight size={14} color="rgba(255,255,255,0.4)" weight="bold" />
          <Text style={styles.stationName} numberOfLines={1}>
            {claim.entryStation ?? 'Unknown'} → {claim.exitStation ?? 'Unknown'}
          </Text>
        </View>
        <Text style={styles.lineName}>
          {claim.lineId
            ? claim.lineId.charAt(0).toUpperCase() + claim.lineId.slice(1) + ' Line'
            : ''}
        </Text>

        {/* Evidence accordion — SJT vs Actual */}
        <Pressable
          style={[styles.accordionHeader, { minHeight: 44 }]}
          onPress={toggleExpand}
          accessibilityRole="button"
          accessibilityLabel="Toggle evidence details"
        >
          <View style={styles.accordionRow}>
            <Text style={styles.accordionLabel}>Evidence · SJT vs Actual</Text>
            {expanded ? (
              <CaretUp size={14} color="#FFFFFF" weight="bold" />
            ) : (
              <CaretDown size={14} color="#FFFFFF" weight="bold" />
            )}
          </View>
        </Pressable>

        {expanded && (
          <View style={styles.accordionBody}>
            <View style={styles.evidenceRow}>
              <Text style={styles.rowLabel}>Corridor</Text>
              <Text style={styles.rowValue}>
                {claim.entryStation ?? '—'} → {claim.exitStation ?? '—'}
              </Text>
            </View>
            <View style={styles.evidenceRow}>
              <Text style={styles.rowLabel}>Scheduled</Text>
              <Text style={styles.rowValue}>{scheduledTime}</Text>
            </View>
            <View style={styles.evidenceRow}>
              <Text style={styles.rowLabel}>Actual</Text>
              <Text style={styles.rowValue}>{actualTime}</Text>
            </View>
            <View style={styles.evidenceRow}>
              <Text style={styles.rowLabel}>Delay</Text>
              <Text style={styles.delayValue}>{`+${claim.delayMinutes}m`}</Text>
            </View>
            <View style={styles.evidenceRow}>
              <Text style={styles.rowLabel}>Cause</Text>
              <Text style={[styles.rowValue, styles.causeValue]}>
                {claim.cause || claim.windowCause || 'TfL Service Disruption'}
              </Text>
            </View>
            <View style={styles.evidenceRow}>
              <Text style={styles.rowLabel}>Fare estimate</Text>
              <Text style={styles.rowValue}>~{formatPence(claim.amountPence)}</Text>
            </View>
            <Text style={styles.fareDisclaimer}>{FARE_DISCLAIMER}</Text>
          </View>
        )}

        {/* Pagination when total > 1 */}
        {total > 1 && (
          <View style={styles.paginationRow}>
            <Pressable
              style={[
                styles.paginationButton,
                { opacity: index === 0 ? 0.35 : 1 },
              ]}
              disabled={index === 0}
              accessibilityRole="button"
              accessibilityLabel="Previous claim"
              onPress={onPrev}
            >
              <CaretLeft size={20} color="rgba(255,255,255,0.6)" />
            </Pressable>
            <Text style={styles.paginationText}>
              {index + 1} of {total}
            </Text>
            <Pressable
              style={[
                styles.paginationButton,
                { opacity: index === total - 1 ? 0.35 : 1 },
              ]}
              disabled={index === total - 1}
              accessibilityRole="button"
              accessibilityLabel="Next claim"
              onPress={onNext}
            >
              <CaretRight size={20} color="rgba(255,255,255,0.6)" />
            </Pressable>
          </View>
        )}

        {/* Actions / optimistic filed state */}
        {locallyFiledAtMs != null ? (
          <View style={styles.filedBox}>
            <Clock size={16} color="#0098D4" weight="bold" />
            <Text style={styles.filedText}>
              Filed — awaiting TfL review (normally 10 working days).
            </Text>
          </View>
        ) : (
          <View style={styles.actionStack}>
            {/* PRIMARY: portal hand-off via parent assistant */}
            <Pressable
              style={styles.primaryButton}
              accessibilityRole="button"
              accessibilityLabel="Open TfL Portal and Copy Details"
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onOpenPortal();
              }}
            >
              <ArrowSquareOut size={16} color="#0A0F3C" weight="bold" />
              <Text style={styles.buttonText}>Open TfL Portal & Copy Details</Text>
            </Pressable>

            {/* SECONDARY: optimistic local filing */}
            <Pressable
              style={styles.secondaryButton}
              accessibilityRole="button"
              accessibilityLabel="I've filed this claim"
              disabled={filing}
              onPress={() => onFile(claim.id)}
            >
              {filing ? (
                <ActivityIndicator size="small" color="#0098D4" />
              ) : (
                <Text style={styles.secondaryText}>I've Filed This Claim</Text>
              )}
            </Pressable>

            {/* TERTIARY: optimistic dismissal */}
            <Pressable
              style={styles.tertiaryButton}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Not now, dismiss this claim"
              onPress={() => onDismiss(claim.id)}
            >
              <Text style={styles.tertiaryText}>Not now</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
};

ActiveClaimHeroCard.displayName = 'ActiveClaimHeroCard';

const styles = StyleSheet.create({
  outer: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.45)',
    marginBottom: 16,
  },
  // Plain View owns ALL layout — BlurView above is background-only.
  content: {
    backgroundColor: 'rgba(10, 15, 60, 0.75)',
    padding: 18,
    gap: 12,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  bannerBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  bannerText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#F59E0B',
    letterSpacing: 0.6,
  },
  countdownChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  countdownText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F59E0B',
  },
  routeBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stationName: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  lineName: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: -8,
  },
  accordionHeader: {
    justifyContent: 'center',
  },
  accordionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  accordionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.75)',
  },
  accordionBody: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  evidenceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  rowValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'right',
    flexShrink: 1,
  },
  causeValue: {
    fontWeight: '400',
    flexShrink: 1,
  },
  delayValue: {
    fontSize: 13,
    color: '#FF3B30',
    fontWeight: '700',
  },
  fareDisclaimer: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.45)',
    lineHeight: 14,
    marginTop: 2,
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  paginationButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paginationText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  actionStack: {
    gap: 8,
  },
  primaryButton: {
    backgroundColor: '#0098D4',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0A0F3C',
  },
  secondaryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  tertiaryButton: {
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tertiaryText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center',
  },
  filedBox: {
    backgroundColor: 'rgba(0, 152, 212, 0.1)',
    borderRadius: 10,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    flex: 1,
    lineHeight: 16,
  },
});

export default ActiveClaimHeroCard;
