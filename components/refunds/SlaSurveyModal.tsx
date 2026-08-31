// components/refunds/SlaSurveyModal.tsx
// Day 14 SLA Resolution Survey (FE-04) — extracted single source.
// Used by both the Radar tab orchestrator and the /refunds/history receipts
// screen so the survey UX can never drift between surfaces.

import React from 'react'
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native'
import * as Haptics from 'expo-haptics'
import { BlurView } from 'expo-blur'
import { Clock } from 'phosphor-react-native'
import {
  workingDaysSince,
  formatPence,
} from '../../services/refundSlaService'
import type { RadarClaim } from './types'

export type SurveyOutcome =
  | 'PAID_FULL'
  | 'PAID_PARTIAL'
  | 'REJECTED'
  | 'STILL_WAITING'

interface SlaSurveyModalProps {
  visible: boolean
  claim: RadarClaim | null
  onClose: () => void
  onSubmit: (
    id: number,
    outcome: SurveyOutcome,
    settledAmountPence?: number
  ) => void
}

const SURVEY_OPTIONS: {
  key: SurveyOutcome
  bg: string
  textColor: string
  label: (amount: string) => string
  haptic: () => Promise<void>
}[] = [
  {
    key: 'PAID_FULL',
    bg: '#34C759',
    textColor: '#FFFFFF',
    label: (a) => `Paid in Full (${a})`,
    haptic: () =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  },
  {
    key: 'PAID_PARTIAL',
    bg: '#F59E0B',
    textColor: '#0A0F3C',
    label: () => 'Partial Payout',
    haptic: () =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  },
  {
    key: 'REJECTED',
    bg: '#FF3B30',
    textColor: '#FFFFFF',
    label: () => 'Rejected by TfL',
    haptic: () =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  },
  {
    key: 'STILL_WAITING',
    bg: 'rgba(255,255,255,0.12)',
    textColor: '#FFFFFF',
    label: () => 'Still Waiting (Check back in 3 days)',
    haptic: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  },
]

export function SlaSurveyModal({
  visible,
  claim,
  onClose,
  onSubmit,
}: SlaSurveyModalProps) {
  if (!claim) return null

  const daysSinceFiled = claim.filedAt ? workingDaysSince(claim.filedAt) : 0

  const handleOption = async (
    option: (typeof SURVEY_OPTIONS)[number]
  ): Promise<void> => {
    await option.haptic().catch(() => {})
    if (option.key === 'STILL_WAITING') {
      onSubmit(claim.id, 'STILL_WAITING')
    } else if (option.key === 'PAID_FULL') {
      onSubmit(claim.id, 'PAID_FULL', claim.amountPence)
    } else if (option.key === 'PAID_PARTIAL') {
      // Conservative statutory midpoint until the user amends the figure.
      onSubmit(claim.id, 'PAID_PARTIAL', Math.round(claim.amountPence / 2))
    } else {
      onSubmit(claim.id, 'REJECTED')
    }
    onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <BlurView intensity={50} tint="dark" style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Clock size={24} color="#0098D4" weight="bold" />
            <Text style={styles.modalTitle}>TfL Delay Repay SLA Review</Text>
          </View>
          <Text style={styles.modalSubtitle}>
            Filed {daysSinceFiled} working days ago. Did your{' '}
            {formatPence(claim.amountPence)} refund for {claim.entryStation} →{' '}
            {claim.exitStation} land in your account?
          </Text>

          <View style={styles.surveyButtons}>
            {SURVEY_OPTIONS.map((option) => (
              <Pressable
                key={option.key}
                style={[styles.surveyBtn, { backgroundColor: option.bg }]}
                onPress={() => {
                  void handleOption(option)
                }}
                accessibilityRole="button"
                accessibilityLabel={option.label(formatPence(claim.amountPence))}
              >
                <Text style={[styles.surveyBtnText, { color: option.textColor }]}>
                  {option.label(formatPence(claim.amountPence))}
                </Text>
              </Pressable>
            ))}
          </View>
        </BlurView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: 'rgba(10, 15, 60, 0.95)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderTopWidth: 1.25,
    borderTopColor: 'rgba(0, 152, 212, 0.50)',
    borderBottomColor: 'rgba(0, 152, 212, 0.20)',
    borderLeftColor: 'rgba(0, 152, 212, 0.30)',
    borderRightColor: 'rgba(0, 152, 212, 0.30)',
    gap: 16,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.50,
    shadowRadius: 24,
    elevation: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modalSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.75)',
    lineHeight: 20,
  },
  surveyButtons: {
    gap: 10,
  },
  surveyBtn: {
    minHeight: 48,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  surveyBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
})
