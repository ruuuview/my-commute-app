import React from 'react'
import { View, Text, StyleSheet, Pressable, Modal, Platform } from 'react-native'
import * as Haptics from 'expo-haptics'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
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
        <View style={styles.modalContainer}>
          <BlurView intensity={Platform.OS === 'ios' ? 70 : 100} tint="dark" style={StyleSheet.absoluteFillObject} />
          
          <LinearGradient
            colors={[
              'rgba(0, 152, 212, 0.15)',
              'rgba(10, 22, 58, 0.55)',
              'rgba(4, 9, 26, 0.92)',
            ]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />

          <LinearGradient
            colors={['rgba(255, 255, 255, 0.75)', 'rgba(255, 255, 255, 0.15)', 'transparent']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.specularTopSheen}
            pointerEvents="none"
          />

          <View style={styles.modalHeader}>
            <Clock size={24} color="#38BDF8" weight="bold" />
            <Text style={styles.modalTitle}>TfL Delay Repay SLA Review</Text>
          </View>
          <Text style={styles.modalSubtitle}>
            Filed {daysSinceFiled} working days ago. Did your{' '}
            <Text style={styles.amountHighlight}>{formatPence(claim.amountPence)}</Text> refund for {claim.entryStation} →{' '}
            {claim.exitStation} land in your account?
          </Text>

          <View style={styles.surveyButtons}>
            {SURVEY_OPTIONS.map((option) => (
              <Pressable
                key={option.key}
                style={({ pressed }) => [
                  styles.surveyBtn,
                  { backgroundColor: option.bg },
                  pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
                ]}
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
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: Platform.OS === 'ios' ? 'rgba(7, 14, 38, 0.72)' : 'rgba(7, 14, 38, 0.96)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.32)',
    gap: 16,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.75,
    shadowRadius: 24,
    elevation: 20,
  },
  specularTopSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    zIndex: 10,
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
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.75)',
    lineHeight: 20,
  },
  amountHighlight: {
    color: '#38BDF8',
    fontWeight: '700',
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
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.20)',
  },
  surveyBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
})

