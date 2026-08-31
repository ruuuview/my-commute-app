// components/refunds/ActiveClaimHeroCard.tsx
// Radar v3 Gold Standard — Actionable Claim Feed Card with pristine Apple Liquid Glass.

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
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
import { GLASS } from '../../theme/colors';

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
      <BlurView intensity={GLASS.blurIntensity} tint="dark" style={StyleSheet.absoluteFillObject} />

      <LinearGradient
        colors={[GLASS.specularStart, GLASS.specularEnd]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
        style={styles.specularTopSheen}
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
              ~{formatPence(claim.amountPence ?? 310)}
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
  );
};

export default ActiveClaimHeroCard;

const styles = StyleSheet.create({
  outerContainer: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.25,
    borderColor: GLASS.borderColor,
    backgroundColor: Platform.OS === 'android' ? '#0E0E14' : GLASS.background,
    marginBottom: 16,
    position: 'relative',
  },
  specularTopSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 18,
  },
  cardBody: {
    padding: 16,
    gap: 12,
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
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 11,
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
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.75)',
  },
  ghostDismissButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
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
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  arrowIcon: {
    marginHorizontal: 2,
  },
  timestampText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.60)',
    marginTop: 2,
  },
  valueCol: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 20,
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  estRefundBadge: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 9.5,
    color: '#10B981',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  proofCapsule: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 8,
  },
  proofIcon: {
    marginTop: 2,
    flexShrink: 0,
  },
  proofText: {
    flex: 1,
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(255, 255, 255, 0.75)',
  },
  proofMetrics: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    color: 'rgba(255, 255, 255, 0.95)',
  },
  primaryCtaButton: {
    height: 48,
    borderRadius: 14,
    backgroundColor: '#0098D4',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  primaryCtaText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 14,
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
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 12.5,
    color: '#10B981',
  },
});
