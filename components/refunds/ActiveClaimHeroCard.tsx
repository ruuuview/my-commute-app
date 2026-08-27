// components/refunds/ActiveClaimHeroCard.tsx
// Radar v3 Gold Standard — Actionable Claim Feed Card (~185px dynamic height).
// Left line-accent strip, 1-glance dark glass proof capsule (zero accordions),
// dominant 48pt primary CTA for 5-chip Claim Assistant, top-right ghost dismiss.

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import {
  Clock,
  ArrowRight,
  X,
  ArrowSquareOut,
  Info,
  CheckCircle,
} from 'phosphor-react-native';
import {
  RadarClaim,
  daysLeftUntil,
} from '../../components/refunds/types';
import { formatPence } from '../../services/refundSlaService';
import { LINE_IDENTITY_COLORS, LINE_NAMES } from '../../constants/lineColors';

export interface ActiveClaimHeroCardProps {
  claim: RadarClaim;
  index?: number;
  total?: number;
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
  onDismiss,
  onOpenPortal,
  locallyFiledAtMs,
}) => {
  const lineKey = (claim.lineId ?? 'victoria').toLowerCase().trim();
  const lineColor = LINE_IDENTITY_COLORS[lineKey] ?? '#0098D4';
  const lineDisplayName = LINE_NAMES[lineKey] ?? (claim.lineId ? claim.lineId.charAt(0).toUpperCase() + claim.lineId.slice(1) : 'Tube');
  const isNorthern = lineKey === 'northern';

  const daysLeft = daysLeftUntil(claim.expiresAt);
  const expiresText = daysLeft === 0 ? 'Expires today' : `${daysLeft}d left`;

  const entryDate = claim.entryTime ? new Date(claim.entryTime) : null;
  const exitDate = claim.exitTime ? new Date(claim.exitTime) : null;

  // Format date + time (e.g. "Wed 26 Aug · 14:11 touch-in")
  const dateFormatted = entryDate
    ? entryDate.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : 'Today';

  const timeFormatted = entryDate
    ? entryDate.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '14:11';

  // Compute actual travel vs baseline
  let actualDurationMin = 25;
  if (entryDate && exitDate) {
    const diff = Math.round((exitDate.getTime() - entryDate.getTime()) / 60000);
    if (diff > 0) actualDurationMin = diff;
  }
  const delayMin = claim.delayMinutes || 15;
  const baselineMin = Math.max(4, actualDurationMin - delayMin);
  const causeText = claim.cause || claim.windowCause || 'Signal failure at Oxford Circus';

  const handleDismiss = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDismiss(claim.id);
  };

  const handlePrimaryPress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onOpenPortal();
  };

  return (
    <View style={styles.outerContainer}>
      <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
      <View style={styles.surfaceFill}>
        {/* Left 3.5px solid line-identity accent strip */}
        <View
          style={[
            styles.lineAccentStrip,
            { backgroundColor: lineColor },
            isNorthern && styles.northernAccentBorder,
          ]}
        />

        <View style={styles.cardBody}>
          {/* Top Header Row: Line Badge + Countdown + Ghost Dismiss */}
          <View style={styles.topHeaderRow}>
            {/* High-contrast Line Badge */}
            <View style={styles.lineBadge}>
              <View
                style={[
                  styles.lineDot,
                  { backgroundColor: lineColor },
                  isNorthern && styles.northernDotBorder,
                ]}
              />
              <Text style={styles.lineBadgeText}>{lineDisplayName} Line</Text>
            </View>

            {/* Right: Countdown Capsule + Ghost Dismiss (44x44 hit target) */}
            <View style={styles.topRightActions}>
              <View style={styles.countdownBadge}>
                <Clock size={11} color="rgba(255, 255, 255, 0.75)" weight="bold" />
                <Text style={styles.countdownText}>{expiresText}</Text>
              </View>

              <Pressable
                style={styles.ghostDismissButton}
                onPress={handleDismiss}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Dismiss this claim"
              >
                <X size={15} color="rgba(255, 255, 255, 0.45)" weight="bold" />
              </Pressable>
            </View>
          </View>

          {/* Primary Route + Refund Value Row */}
          <View style={styles.primaryInfoRow}>
            {/* Route & Timestamp */}
            <View style={styles.routeCol}>
              <View style={styles.stationRow}>
                <Text style={styles.stationName} numberOfLines={2}>
                  {claim.entryStation ?? 'Origin'}
                </Text>
                <ArrowRight size={13} color="rgba(255, 255, 255, 0.4)" weight="bold" style={styles.arrowIcon} />
                <Text style={styles.stationName} numberOfLines={2}>
                  {claim.exitStation ?? 'Destination'}
                </Text>
              </View>
              <Text style={styles.timestampText}>
                {dateFormatted} · {timeFormatted}
              </Text>
            </View>

            {/* Estimated Value */}
            <View style={styles.valueCol}>
              <Text style={styles.amountText}>
                ~{formatPence(claim.amountPence ?? 280)}
              </Text>
              <Text style={styles.estRefundBadge}>EST. REFUND</Text>
            </View>
          </View>

          {/* Integrated Proof Capsule (100% visible, zero accordions) */}
          <View style={styles.proofCapsule}>
            <Info size={13} color="#0098D4" weight="fill" style={styles.proofIcon} />
            <Text style={styles.proofText} numberOfLines={2}>
              <Text style={styles.proofMetrics}>
                {actualDurationMin}m actual vs {baselineMin}m baseline (+{delayMin}m delay)
              </Text>
              {' · '}
              {causeText}
            </Text>
          </View>

          {/* Action Area: Optimistic Filed State vs 48pt Primary Assistant CTA */}
          {locallyFiledAtMs != null ? (
            <View style={styles.filedStatusBanner}>
              <CheckCircle size={15} color="#10B981" weight="fill" />
              <Text style={styles.filedStatusText}>
                Filed — Awaiting TfL 10-day review
              </Text>
            </View>
          ) : (
            <Pressable
              style={styles.primaryCtaButton}
              onPress={handlePrimaryPress}
              accessibilityRole="button"
              accessibilityLabel="File a claim on TfL"
            >
              <ArrowSquareOut size={16} color="#0A0F3C" weight="bold" />
              <Text style={styles.primaryCtaText}>
                File a Claim ↗
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
};

export default ActiveClaimHeroCard;

const styles = StyleSheet.create({
  outerContainer: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.09)',
    backgroundColor: 'rgba(10, 15, 60, 0.65)',
    marginBottom: 12,
  },
  surfaceFill: {
    flexDirection: 'row',
    position: 'relative',
  },
  lineAccentStrip: {
    width: 3.5,
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
  },
  northernAccentBorder: {
    borderRightWidth: 1,
    borderRightColor: '#3A3A3C',
  },
  cardBody: {
    flex: 1,
    padding: 16,
    paddingLeft: 14,
    gap: 10,
  },
  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 6,
  },
  lineDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  northernDotBorder: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  lineBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  countdownText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.75)',
  },
  ghostDismissButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  routeCol: {
    flex: 1,
    gap: 3,
  },
  stationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  stationName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  arrowIcon: {
    marginHorizontal: 1,
  },
  timestampText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  valueCol: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 19,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  estRefundBadge: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  proofCapsule: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(0, 0, 0, 0.38)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    gap: 6,
  },
  proofIcon: {
    marginTop: 1,
    flexShrink: 0,
  },
  proofText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
    color: 'rgba(255, 255, 255, 0.75)',
  },
  proofMetrics: {
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.95)',
  },
  primaryCtaButton: {
    height: 46,
    borderRadius: 13,
    backgroundColor: '#0098D4',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 2,
  },
  primaryCtaText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0A0F3C',
    letterSpacing: 0.1,
  },
  filedStatusBanner: {
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 2,
  },
  filedStatusText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#10B981',
  },
});
