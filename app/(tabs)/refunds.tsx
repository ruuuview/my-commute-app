// app/(tabs)/refunds.tsx
// Refund Radar — clean delay repay claims history & active radar tracking.
//
// The "Did you get it?" loop (v10 spec):
//   Eligible (app-detected) → Filed (user taps "I filed my claim") →
//   Received (user taps "Money received").

import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Linking,
  Image,
  Alert,
  Modal,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import * as WebBrowser from 'expo-web-browser'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BlurView } from 'expo-blur'
import {
  Broadcast,
  CheckCircle,
  Clock,
  WarningCircle,
  Link as LinkIcon,
  LinkBreak,
  ArrowSquareOut,
  ArrowRight,
  ShieldCheck,
  PaperPlaneRight,
  ArrowsClockwise,
  Train,
  Sparkle,
  Copy,
  Info,
} from 'phosphor-react-native'
import { APP_CONFIG } from '../../config/app.config'
import { ensureDeviceIdentity } from '../../services/deviceIdentity'
import { STATUS_SEVERITY_COLORS } from '../../utils/getSeverityColor'
import { useRouter } from 'expo-router'
import { useUserPreferencesStore } from '../../store/userPreferencesStore'
import { tflCapitalise } from '../../utils/tflCapitalise'
import { OnboardingGradient } from '../../components/OnboardingGradient'

// ── Operational Constants ─────────────────────────────────────────────
// TFL_CONTACTLESS_PORTAL_URL: Official TfL contactless & Oyster journey history portal
const TFL_CONTACTLESS_PORTAL_URL = 'https://tfl.gov.uk/fares/contactless-and-oyster-account'

import {
  isOverdue,
  workingDaysSince,
  formatPence,
  isSurveySnoozed,
  snoozeSurvey,
  DUE_CLAIM_WORKING_DAYS,
  formatRelativeTime,
} from '../../services/refundSlaService'

// ── Types ─────────────────────────────────────────────────────────────

interface Claim {
  id: number
  status: string
  claimStatus: 'eligible' | 'filed' | 'received' | null
  filedAt: string | null
  receivedAt: string | null
  amountPence: number
  cause: string | null
  causeEligible: boolean
  delayMinutes: number
  expiresAt: string
  createdAt: string
  lineId: string
  operator: string
  entryStation: string | null
  exitStation: string | null
  entryTime: string | null
  exitTime: string | null
  windowCause: string | null
  journeySpec?: {
    fareEstimated?: boolean
    fareCaveat?: string
  } | null
}

interface ClaimsResponse {
  claims: Claim[]
  pendingTotal: number
  recoveredTotal: number
  count: number
  evaluatedAt?: string
}

// ── Status display config ─────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; Icon: React.ComponentType<{ size?: number; color?: string; weight?: any }> }> = {
  eligible:   { label: 'Eligible — file on TfL', color: '#FFB800', Icon: WarningCircle },
  filed:      { label: 'Filed — awaiting payment', color: '#0098D4', Icon: PaperPlaneRight },
  received:   { label: 'Received', color: '#34C759', Icon: CheckCircle },
  unverified: { label: 'Unverified Notice', color: 'rgba(255,255,255,0.55)', Icon: Info },
  ineligible: { label: 'Not Eligible', color: 'rgba(255,255,255,0.35)', Icon: WarningCircle },
  expired:    { label: 'Expired', color: 'rgba(255,255,255,0.2)', Icon: Clock },
}

function loopState(claim: Claim): 'eligible' | 'filed' | 'received' | 'unverified' | 'ineligible' | 'closed' {
  if (claim.claimStatus) return claim.claimStatus
  if (claim.status === 'detected' || claim.status === 'notified') return 'eligible'
  if (claim.status === 'unverified') return 'unverified'
  if (claim.status === 'ineligible') return 'ineligible'
  return 'closed'
}

// ── Quick Copy Accessory Bar (Safari Assistant) ─────────────────────────

const QuickCopyAccessoryBar = ({
  claim,
  dateStr,
}: {
  claim: Claim
  dateStr: string
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const copyField = async (key: string, value: string | null | undefined) => {
    if (!value) return
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    await Clipboard.setStringAsync(value)
    setCopiedField(key)
    setTimeout(() => setCopiedField(null), 1800)
  }

  const timeStr = claim.entryTime
    ? new Date(claim.entryTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : ''

  const lineName = claim.lineId ? claim.lineId.charAt(0).toUpperCase() + claim.lineId.slice(1) : ''

  return (
    <View style={styles.accessoryBarOuter}>
      <View style={styles.accessoryBarHeader}>
        <View style={styles.accessoryBarTitleWrap}>
          <Copy size={13} color="#0098D4" weight="bold" />
          <Text style={styles.accessoryBarTitle}>1-TAP COPY FOR TFL PORTAL</Text>
        </View>
        <Text style={styles.accessoryBarSubtitle}>Tap a chip to copy straight to clipboard</Text>
      </View>

      <View style={styles.chipRow}>
        <Pressable
          onPress={() => copyField('Date', dateStr)}
          style={[styles.copyChip, copiedField === 'Date' && styles.copyChipActive]}
        >
          <Text style={styles.copyChipText}>📅 {dateStr}</Text>
        </Pressable>

        <Pressable
          onPress={() => copyField('Origin', claim.entryStation)}
          style={[styles.copyChip, copiedField === 'Origin' && styles.copyChipActive]}
        >
          <Text style={styles.copyChipText}>🏢 {claim.entryStation || 'Origin'}</Text>
        </Pressable>

        <Pressable
          onPress={() => copyField('Destination', claim.exitStation)}
          style={[styles.copyChip, copiedField === 'Destination' && styles.copyChipActive]}
        >
          <Text style={styles.copyChipText}>🏢 {claim.exitStation || 'Dest'}</Text>
        </Pressable>

        {timeStr ? (
          <Pressable
            onPress={() => copyField('Time', timeStr)}
            style={[styles.copyChip, copiedField === 'Time' && styles.copyChipActive]}
          >
            <Text style={styles.copyChipText}>⏰ {timeStr}</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => copyField('Line', lineName)}
          style={[styles.copyChip, copiedField === 'Line' && styles.copyChipActive]}
        >
          <Text style={styles.copyChipText}>🚇 {lineName}</Text>
        </Pressable>
      </View>
    </View>
  )
}

// ── Day 14 SLA Resolution Survey Modal ─────────────────────────────────

const SlaSurveyModal = ({
  visible,
  claim,
  onClose,
  onSubmit,
}: {
  visible: boolean
  claim: Claim | null
  onClose: () => void
  onSubmit: (id: number, outcome: 'PAID_FULL' | 'PAID_PARTIAL' | 'REJECTED' | 'STILL_WAITING', settledAmountPence?: number) => void
}) => {
  if (!claim) return null

  const daysSinceFiled = claim.filedAt ? workingDaysSince(claim.filedAt) : 0

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <BlurView intensity={50} tint="dark" style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Clock size={24} color="#0098D4" weight="bold" />
            <Text style={styles.modalTitle}>TfL Delay Repay SLA Review</Text>
          </View>
          <Text style={styles.modalSubtitle}>
            Filed {daysSinceFiled} working days ago. Did your {formatPence(claim.amountPence)} refund for {claim.entryStation} → {claim.exitStation} land in your account?
          </Text>

          <View style={styles.surveyButtons}>
            <Pressable
              style={[styles.surveyBtn, { backgroundColor: '#34C759' }]}
              onPress={async () => {
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
                onSubmit(claim.id, 'PAID_FULL', claim.amountPence)
                onClose()
              }}
            >
              <Text style={styles.surveyBtnText}>✅ Paid in Full ({formatPence(claim.amountPence)})</Text>
            </Pressable>

            <Pressable
              style={[styles.surveyBtn, { backgroundColor: '#FFB800' }]}
              onPress={async () => {
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
                onSubmit(claim.id, 'PAID_PARTIAL', Math.round(claim.amountPence / 2))
                onClose()
              }}
            >
              <Text style={[styles.surveyBtnText, { color: '#0A0F3C' }]}>🟡 Partial Payout</Text>
            </Pressable>

            <Pressable
              style={[styles.surveyBtn, { backgroundColor: '#FF3B30' }]}
              onPress={async () => {
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
                onSubmit(claim.id, 'REJECTED')
                onClose()
              }}
            >
              <Text style={styles.surveyBtnText}>❌ Rejected by TfL</Text>
            </Pressable>

            <Pressable
              style={[styles.surveyBtn, { backgroundColor: 'rgba(255,255,255,0.12)' }]}
              onPress={async () => {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                onSubmit(claim.id, 'STILL_WAITING')
                onClose()
              }}
            >
              <Text style={styles.surveyBtnText}>⏳ Still Waiting (Check back in 3 days)</Text>
            </Pressable>
          </View>
        </BlurView>
      </View>
    </Modal>
  )
}

// ── Harmonized Claim Card (State C) ───────────────────────────────────

const ClaimCard = React.memo(({ claim, onUpdate, onOpenSurvey, updating }: {
  claim: Claim
  onUpdate: (id: number, next: 'filed' | 'received') => void
  onOpenSurvey: (claim: Claim) => void
  updating?: 'filed' | 'received'
}) => {
  const state = loopState(claim)
  const cfg = STATUS_CONFIG[state] ?? { label: state, color: '#888', Icon: WarningCircle }
  const overdue = isOverdue(claim)
  const IconComponent = cfg.Icon

  const dateStr = claim.entryTime
    ? new Date(claim.entryTime).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : new Date(claim.createdAt).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short',
      })

  const causeText = claim.cause || claim.windowCause || 'TfL Service Disruption'

  return (
    <View style={styles.cardOuter}>
      <BlurView intensity={30} tint="dark" style={styles.cardBlur}>
        {/* Honest Detection Banner for Eligible Claims */}
        {state === 'eligible' && (
          <View style={styles.eligibleHeaderBanner}>
            <Sparkle size={13} color="#FFB800" weight="fill" />
            <Text style={styles.eligibleHeaderBannerText}>
              ELIGIBLE FOR ESTIMATED REFUND
            </Text>
          </View>
        )}

        {/* Top row: status badge + amount */}
        <View style={styles.cardHeader}>
          <View style={[styles.statusBadge, { borderColor: cfg.color }]}>
            <IconComponent size={14} color={cfg.color} weight="bold" />
            <Text style={[styles.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          <Text style={styles.amountText}>{formatPence(claim.amountPence)}</Text>
        </View>

        {/* Journey details */}
        <View style={styles.journeyRow}>
          <Train size={14} color="rgba(255,255,255,0.45)" weight="regular" />
          <Text style={styles.journeyLine}>
            {claim.lineId.charAt(0).toUpperCase() + claim.lineId.slice(1)} Line
          </Text>
        </View>

        <View style={styles.stationRow}>
          <Text style={styles.stationText} numberOfLines={1}>
            {claim.entryStation ?? 'Unknown'}
          </Text>
          <ArrowRight size={14} color="rgba(255,255,255,0.35)" weight="bold" />
          <Text style={styles.stationText} numberOfLines={1}>
            {claim.exitStation ?? 'Unknown'}
          </Text>
        </View>

        {/* Disruption Cause */}
        <View style={styles.causeRow}>
          <Info size={13} color="rgba(255,255,255,0.45)" weight="regular" />
          <Text style={styles.causeText} numberOfLines={2}>
            {causeText}
          </Text>
        </View>

        {/* Bottom metadata */}
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{dateStr}</Text>
          {claim.causeEligible && (
            <View style={styles.delayBadge}>
              <Text style={styles.delayText}>+{claim.delayMinutes}m delay</Text>
            </View>
          )}
        </View>

        {/* TfL Capping & Policy Disclaimer */}
        <View style={styles.cappingDisclaimerBox}>
          <Text style={styles.cappingDisclaimerText}>
            TfL determines final payout based on your daily cap or Travelcard status upon claim submission.
          </Text>
        </View>

        {/* Passive Notice for Unverified Claims */}
        {state === 'unverified' && (
          <View style={styles.unverifiedNoticeBox}>
            <Info size={14} color="#0098D4" weight="bold" />
            <Text style={styles.unverifiedNoticeText}>
              TfL reported an unverified disruption notice. Automated claim calculation is unavailable. You can check your TfL online journey history for manual delay repay.
            </Text>
          </View>
        )}

        {/* Passive Notice for Ineligible Claims */}
        {state === 'ineligible' && (
          <View style={styles.ineligibleNoticeBox}>
            <WarningCircle size={14} color="rgba(255,255,255,0.5)" weight="bold" />
            <Text style={styles.ineligibleNoticeText}>
              Non-refundable statutory event (e.g. weather, strike, or customer incident). Excluded from TfL Service Delay scheme.
            </Text>
          </View>
        )}

        {/* Actions for Eligible / Active Claims */}
        {state === 'eligible' && (
          <View style={styles.actionContainer}>
            <Pressable
              onPress={async () => {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
                await WebBrowser.openBrowserAsync(TFL_CONTACTLESS_PORTAL_URL)
              }}
              style={styles.primaryActionButton}
            >
              <ArrowSquareOut size={16} color="#0A0F3C" weight="bold" />
              <Text style={styles.primaryActionText}>Open TfL Claim Assistant</Text>
            </Pressable>

            <Pressable
              onPress={() => onUpdate(claim.id, 'filed')}
              disabled={updating === 'filed'}
              style={styles.secondaryActionButton}
            >
              {updating === 'filed' ? (
                <ActivityIndicator size="small" color="#0098D4" />
              ) : (
                <Text style={styles.secondaryActionText}>I Filed This Claim</Text>
              )}
            </Pressable>

            {/* Quick Copy Accessory Bar */}
            <QuickCopyAccessoryBar claim={claim} dateStr={dateStr} />
          </View>
        )}

        {/* State: Filed (Awaiting payment) */}
        {state === 'filed' && (
          <View style={styles.actionContainer}>
            <View style={styles.filedStatusBox}>
              <Clock size={16} color="#0098D4" weight="bold" />
              <Text style={styles.filedStatusText}>
                {overdue
                  ? `Past ${DUE_CLAIM_WORKING_DAYS} working days — TfL review overdue.`
                  : 'Awaiting TfL processing (normally within 10 working days).'}
              </Text>
            </View>

            <Pressable
              onPress={() => onOpenSurvey(claim)}
              style={[styles.primaryActionButton, overdue && { backgroundColor: '#FFB800' }]}
            >
              <Text style={[styles.primaryActionText, overdue && { color: '#0A0F3C' }]}>
                {overdue ? 'Review Claim Outcome' : 'Money Received'}
              </Text>
            </Pressable>
          </View>
        )}

        {/* State: Received */}
        {state === 'received' && (
          <View style={styles.receivedSuccessBox}>
            <CheckCircle size={16} color="#34C759" weight="fill" />
            <Text style={styles.receivedSuccessText}>Refund logged as received.</Text>
          </View>
        )}
      </BlurView>
    </View>
  )
})
ClaimCard.displayName = 'ClaimCard'

// ── UNREGISTERED STATE: Single High-Conversion Pitch Card (State A) ───

const TflUnregisteredPitchCard = React.memo(({
  onRegister,
  onToggleRegistered,
}: {
  onRegister: () => void
  onToggleRegistered: (val: boolean) => void
}) => {
  return (
    <View style={styles.explainerCardOuter}>
      <BlurView intensity={30} tint="dark" style={styles.explainerCardBlur}>
        <View style={styles.explainerInner}>
          <View style={styles.explainerHeaderRow}>
            <View style={styles.explainerIconWrap}>
              <Broadcast size={20} color="#0098D4" weight="bold" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.explainerEyebrow}>TFL DELAY REPAY ENGINE</Text>
              <Text style={styles.explainerTitle}>One tap makes Refund Radar actually work</Text>
            </View>
          </View>

          <Text style={styles.explainerBody}>
            Refund Radar claims your delay money back from TfL. But it can only reach the journeys TfL lets it see.
          </Text>

          {/* Loss-Aversion Comparison Container */}
          <View style={styles.comparisonBox}>
            <View style={styles.compareItem}>
              <View style={styles.compareIconPill}>
                <LinkIcon size={18} color="#0098D4" weight="bold" />
              </View>
              <View style={styles.compareTextCol}>
                <Text style={styles.compareHeading}>Registered with TfL</Text>
                <Text style={styles.compareBody}>
                  Full 28-day Delay Repay window. Refund Radar reaches every eligible delay within TfL’s 28-day claim policy.
                </Text>
              </View>
            </View>

            <View style={styles.comparisonDivider} />

            <View style={styles.compareItem}>
              <View style={[styles.compareIconPill, { backgroundColor: 'rgba(255, 255, 255, 0.08)' }]}>
                <LinkBreak size={18} color="rgba(255, 255, 255, 0.6)" weight="bold" />
              </View>
              <View style={styles.compareTextCol}>
                <Text style={[styles.compareHeading, { color: 'rgba(255,255,255,0.75)' }]}>Not registered</Text>
                <Text style={styles.compareBody}>
                  Only 7 days of journey history visible online. Delays from 8–28 days ago are lost and cannot be viewed.
                </Text>
              </View>
            </View>
          </View>

          {/* Security Notice */}
          <View style={styles.securityRow}>
            <ShieldCheck size={16} color="rgba(255,255,255,0.6)" weight="regular" />
            <Text style={styles.securityText}>
              Sign in once in the in-app browser so your session stays active. Your card details never touch this app.
            </Text>
          </View>

          {/* Single Focused CTA Block */}
          <View style={styles.ctaGroup}>
            <Pressable
              onPress={onRegister}
              style={({ pressed }) => [
                styles.registerPrimaryCta,
                pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Sign In or Register on TfL"
            >
              <ArrowSquareOut size={18} color="#0A0F3C" weight="bold" />
              <Text style={styles.registerPrimaryCtaText}>Sign In / Register on TfL</Text>
            </Pressable>

            <Pressable
              onPress={() => onToggleRegistered(true)}
              style={({ pressed }) => [
                styles.alreadyRegisteredBtn,
                pressed && { opacity: 0.7 },
              ]}
              hitSlop={8}
            >
              <Text style={styles.alreadyRegisteredBtnText}>Already signed in? Enable 28-day Radar</Text>
            </Pressable>
            <Text style={styles.honestAttestationMicrocopy}>
              We cannot verify this with TfL — we trust your confirmation here.
            </Text>
          </View>
        </View>
      </BlurView>
    </View>
  )
})
TflUnregisteredPitchCard.displayName = 'TflUnregisteredPitchCard'

// ── REGISTERED ZERO-STATE: Single Honest Status Hero Card (State B) ───

const CleanRadarLiveScanner = React.memo(({
  savedLines,
  evaluatedAt,
}: {
  savedLines: string[]
  evaluatedAt?: string | null
}) => {
  const [relativeTime, setRelativeTime] = useState(() => formatRelativeTime(evaluatedAt))

  useEffect(() => {
    setRelativeTime(formatRelativeTime(evaluatedAt))
    const interval = setInterval(() => {
      setRelativeTime(formatRelativeTime(evaluatedAt))
    }, 10000)
    return () => clearInterval(interval)
  }, [evaluatedAt])

  return (
    <View style={styles.cleanScannerOuter}>
      <BlurView intensity={30} tint="dark" style={styles.cleanScannerBlur}>
        {/* Radar Signal + Live Relative Ticker */}
        <View style={styles.scannerTopRow}>
          <View style={styles.radarPulsingRing}>
            <Broadcast size={24} color="#0098D4" weight="bold" />
          </View>
          <View style={styles.tickerBadge}>
            <View style={styles.tickerDot} />
            <Text style={styles.tickerText}>{relativeTime}</Text>
          </View>
        </View>

        {/* Hero Answer */}
        <Text style={styles.heroAmountFact}>£0.00 Waiting · All Clear</Text>
        <Text style={styles.cleanScannerSubtitle}>
          No qualifying delays over 15 minutes detected today on your commute routes.
        </Text>

        {/* Active Lines Chip Row */}
        {savedLines.length > 0 && (
          <View style={styles.monitoredLinesContainer}>
            <Text style={styles.monitoredLinesLabel}>SCANNING CORRIDORS</Text>
            <View style={styles.linePillsWrap}>
              {savedLines.map((lineId) => (
                <View key={lineId} style={styles.lineTagPill}>
                  <View style={styles.lineTagDot} />
                  <Text style={styles.lineTagText}>{tflCapitalise(lineId)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Quiet Reassurance */}
        <Text style={styles.passiveReassuranceText}>
          We monitor TfL service disruptions 24/7. When an eligible delay hits your lines, your refund claim will appear here automatically ready to claim in 1 tap.
        </Text>
      </BlurView>
    </View>
  )
})
CleanRadarLiveScanner.displayName = 'CleanRadarLiveScanner'

// ── Dedicated Zero-Liability Statutory Disclosure Card ────────────────

const StatutoryDisclosureBox = React.memo(({
  onDisconnect,
}: {
  onDisconnect: () => void
}) => {
  return (
    <View style={styles.statutoryCardOuter}>
      <BlurView intensity={25} tint="dark" style={styles.statutoryCardBlur}>
        <ShieldCheck size={18} color="#0098D4" weight="bold" style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}>
          <View style={styles.statutoryTitleRow}>
            <Text style={styles.statutoryTitle}>28-Day Delay Radar Active</Text>
            <Pressable
              onPress={onDisconnect}
              hitSlop={8}
              style={styles.changePill}
              accessibilityRole="button"
              accessibilityLabel="Change TfL account status"
            >
              <Text style={styles.changePillText}>CHANGE</Text>
            </Pressable>
          </View>
          <Text style={styles.statutoryBody}>
            Self-reported. We cannot verify your account status directly with TfL.
          </Text>
        </View>
      </BlurView>
    </View>
  )
})
StatutoryDisclosureBox.displayName = 'StatutoryDisclosureBox'

// ── Main Screen ───────────────────────────────────────────────────────

export default function RefundsScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const selectedLines = useUserPreferencesStore((s) => s.selectedLines)
  const tflRegistered = useUserPreferencesStore((s) => s.tflRegistered)
  const setTflRegistered = useUserPreferencesStore((s) => s.setTflRegistered)

  const [data, setData] = useState<ClaimsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState<Record<number, 'filed' | 'received'>>({})
  const [surveyClaim, setSurveyClaim] = useState<Claim | null>(null)
  const [lastEvaluatedAt, setLastEvaluatedAt] = useState<string | null>(null)

  // In-app browser auth & neutral confirmation alert
  const handleRegisterWithTfl = useCallback(async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      await WebBrowser.openBrowserAsync(TFL_CONTACTLESS_PORTAL_URL)
      // Neutral, non-pressuring attestation dialog
      Alert.alert(
        'TfL Account Status',
        'Did you sign in or create an account on TfL?',
        [
          {
            text: 'Not yet',
            style: 'cancel',
          },
          {
            text: 'Yes, signed in',
            onPress: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
              setTflRegistered(true)
            },
          },
        ]
      )
    } catch {
      await Linking.openURL(TFL_CONTACTLESS_PORTAL_URL).catch(() => {})
    }
  }, [setTflRegistered])

  const handleToggleRegistered = useCallback(async (val: boolean) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setTflRegistered(val)
  }, [setTflRegistered])

  const fetchClaims = useCallback(async (isRefresh = false) => {
    try {
      setError(null)
      const { userId, apiKey } = await ensureDeviceIdentity()
      if (!isRefresh) setLoading(true)
      const res = await fetch(`${APP_CONFIG.BACKEND_API_URL}/api/claims`, {
        headers: { 'x-user-id': userId, 'x-api-key': apiKey },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: ClaimsResponse = await res.json()
      setLastEvaluatedAt(json.evaluatedAt || new Date().toISOString())

      // Overdue-filed claims surface to the top; the rest newest-first.
      const sorted = [...json.claims].sort((a, b) => {
        const aOver = isOverdue(a) ? 1 : 0
        const bOver = isOverdue(b) ? 1 : 0
        if (aOver !== bOver) return bOver - aOver
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
      setData({ ...json, claims: sorted })
    } catch (e) {
      console.warn('[Refunds] fetch error:', e)
      setError('Could not load claims. Pull down to refresh.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchClaims()
  }, [fetchClaims])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchClaims(true)
  }, [fetchClaims])

  // FE-04: Day 14 Survey Prompt
  useEffect(() => {
    if (!data || data.claims.length === 0) return
    const overdueClaim = data.claims.find(c => isOverdue(c) && !isSurveySnoozed(c.id))
    if (overdueClaim && !surveyClaim) {
      setSurveyClaim(overdueClaim)
    }
  }, [data, surveyClaim])

  const handleSlaSurveySubmit = useCallback(async (
    id: number,
    outcome: 'PAID_FULL' | 'PAID_PARTIAL' | 'REJECTED' | 'STILL_WAITING',
    settledAmountPence?: number
  ) => {
    if (outcome === 'STILL_WAITING') {
      snoozeSurvey(id)
      setSurveyClaim(null)
      return
    }

    try {
      const { userId, apiKey } = await ensureDeviceIdentity()
      const nextClaimStatus = outcome === 'REJECTED' ? 'filed' : 'received'
      const res = await fetch(`${APP_CONFIG.BACKEND_API_URL}/api/claims/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          claimStatus: nextClaimStatus,
          outcomeStatus: outcome,
          settledAmountPence: settledAmountPence ?? 0,
        }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await fetchClaims(true)
    } catch (e) {
      console.warn('[Refunds] SLA survey submit error:', e)
      Alert.alert('Error', 'Could not save feedback. Please try again.')
    }
  }, [fetchClaims])

  const handleUpdateClaim = useCallback(async (id: number, nextStatus: 'filed' | 'received') => {
    try {
      setUpdating(prev => ({ ...prev, [id]: nextStatus }))
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      const { userId, apiKey } = await ensureDeviceIdentity()
      const res = await fetch(`${APP_CONFIG.BACKEND_API_URL}/api/claims/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-api-key': apiKey,
        },
        body: JSON.stringify({ claimStatus: nextStatus }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? `HTTP ${res.status}`)
      }
      await fetchClaims(true)
    } catch (e) {
      console.warn('[Refunds] update error:', e)
      setError('Could not update claim. Pull down to retry.')
    } finally {
      setUpdating(prev => {
        const nextState = { ...prev }
        delete nextState[id]
        return nextState
      })
    }
  }, [fetchClaims])

  // Metrics
  const pendingFormatted = data ? formatPence(data.pendingTotal) : '£0.00'
  const recoveredFormatted = data && data.recoveredTotal > 0 ? formatPence(data.recoveredTotal) : null
  const badgeCount = data ? data.claims.filter(c => c.claimStatus === 'filed' && isOverdue(c)).length : 0
  const hasClaims = Boolean(data && data.claims.length > 0)

  // Header content rendered at top of FlatList
  const renderHeader = () => (
    <View>
      {/* Title */}
      <View style={styles.header}>
        <Text style={styles.title}>Refund Radar</Text>
        <Text style={styles.subtitle}>Automatic delay detection & claims</Text>
      </View>

      {/* State A: High-Conversion Pitch Card if Unregistered */}
      {!tflRegistered && (
        <TflUnregisteredPitchCard
          onRegister={handleRegisterWithTfl}
          onToggleRegistered={handleToggleRegistered}
        />
      )}

      {/* State C Only: Recovered / Pending Metric Banners */}
      {tflRegistered && hasClaims && recoveredFormatted && (
        <View style={styles.bannerOuter}>
          <BlurView intensity={30} tint="dark" style={styles.recoveredBanner}>
            <View>
              <Text style={styles.bannerLabel}>Recovered so far</Text>
              <Text style={styles.recoveredCaption}>{"Money confirmed in your account"}</Text>
            </View>
            <Text style={styles.recoveredAmount}>{recoveredFormatted}</Text>
          </BlurView>
        </View>
      )}

      {tflRegistered && hasClaims && data && data.pendingTotal > 0 && (
        <View style={styles.bannerOuter}>
          <BlurView intensity={30} tint="dark" style={styles.pendingBanner}>
            <Text style={styles.bannerLabel}>Pending refunds</Text>
            <Text style={styles.pendingAmount}>{pendingFormatted}</Text>
          </BlurView>
        </View>
      )}

      {/* Overdue badge */}
      {tflRegistered && hasClaims && badgeCount > 0 && (
        <View style={styles.badgeRow}>
          <View style={styles.badgeDot} />
          <Text style={styles.badgeText}>
            {badgeCount} filed {badgeCount === 1 ? 'claim is' : 'claims are'} past {DUE_CLAIM_WORKING_DAYS} working days — did the money land?
          </Text>
        </View>
      )}

      {/* Claims List Header Label */}
      {tflRegistered && hasClaims && (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Detected Claims</Text>
          <Text style={styles.sectionCount}>{data!.claims.length} total</Text>
        </View>
      )}
    </View>
  )

  // Empty state renderer
  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="rgba(255,255,255,0.5)" />
        </View>
      )
    }

    if (error && !data) {
      return (
        <View style={styles.emptyContainer}>
          <WarningCircle size={48} color="#FFB800" weight="duotone" />
          <Text style={styles.emptyTitle}>Unable to Load Claims</Text>
          <Text style={styles.emptySubtitle}>{error}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => fetchClaims(true)}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <ArrowsClockwise size={16} color="#FFFFFF" weight="bold" style={{ marginRight: 6 }} />
            <Text style={styles.retryButtonText}>Try again</Text>
          </Pressable>
        </View>
      )
    }

    // State B: Registered with 0 claims -> Single Honest Status Hero + Statutory Disclosure
    if (tflRegistered) {
      return (
        <View>
          <CleanRadarLiveScanner
            savedLines={selectedLines}
            evaluatedAt={lastEvaluatedAt}
          />
          <StatutoryDisclosureBox
            onDisconnect={() => handleToggleRegistered(false)}
          />
        </View>
      )
    }

    // State A: Unregistered -> Pitch card is already in header, return null for clean single-card view
    return null
  }

  // Footer component
  const renderFooter = () => {
    if (tflRegistered && hasClaims) {
      return (
        <StatutoryDisclosureBox
          onDisconnect={() => handleToggleRegistered(false)}
        />
      )
    }
    return <View style={{ height: 40 }} />
  }

  return (
    <View style={styles.rootContainer}>
      <OnboardingGradient />

      {/* Film Grain Texture Overlay */}
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        <Image
          source={require('../../assets/images/grain.png')}
          style={[StyleSheet.absoluteFillObject, { opacity: 0.03 }]}
          resizeMode="repeat"
        />
      </View>

      <FlatList
        data={tflRegistered && data ? data.claims : []}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <ClaimCard
            claim={item}
            onUpdate={handleUpdateClaim}
            onOpenSurvey={(claim) => setSurveyClaim(claim)}
            updating={updating[item.id]}
          />
        )}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: Math.max(insets.top + 16, 24),
            paddingBottom: Math.max(insets.bottom + 80, 100),
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#0098D4"
            colors={['#0098D4']}
          />
        }
      />

      {/* Day 14 SLA Resolution Survey Modal */}
      <SlaSurveyModal
        visible={Boolean(surveyClaim)}
        claim={surveyClaim}
        onClose={() => setSurveyClaim(null)}
        onSubmit={handleSlaSurveySubmit}
      />
    </View>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#0A0F3C',
  },
  listContent: {
    paddingHorizontal: 20,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.65)',
    marginTop: 4,
    fontWeight: '400',
  },

  // ── Unregistered Pitch Card (State A) ───
  explainerCardOuter: {
    marginBottom: 20,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0, 152, 212, 0.35)',
  },
  explainerCardBlur: {
    padding: 20,
    backgroundColor: 'rgba(10, 15, 60, 0.75)',
  },
  explainerInner: {
    gap: 16,
  },
  explainerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  explainerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 152, 212, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 152, 212, 0.3)',
  },
  explainerEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0098D4',
    letterSpacing: 0.8,
  },
  explainerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 2,
    lineHeight: 24,
  },
  explainerBody: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.75)',
    lineHeight: 20,
  },
  comparisonBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  compareItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  compareIconPill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 152, 212, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  compareTextCol: {
    flex: 1,
  },
  compareHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  compareBody: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.65)',
    marginTop: 3,
    lineHeight: 17,
  },
  comparisonDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  securityText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    flex: 1,
    lineHeight: 16,
  },
  ctaGroup: {
    gap: 10,
    marginTop: 4,
  },
  registerPrimaryCta: {
    backgroundColor: '#0098D4',
    paddingVertical: 14,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  registerPrimaryCtaText: {
    color: '#0A0F3C',
    fontSize: 15,
    fontWeight: '700',
  },
  alreadyRegisteredBtn: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  alreadyRegisteredBtnText: {
    color: '#0098D4',
    fontSize: 13,
    fontWeight: '600',
  },
  honestAttestationMicrocopy: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.45)',
    textAlign: 'center',
    lineHeight: 15,
  },

  // ── Single Honest Status Hero (State B) ───
  cleanScannerOuter: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0, 152, 212, 0.25)',
    marginBottom: 16,
  },
  cleanScannerBlur: {
    padding: 24,
    backgroundColor: 'rgba(10, 15, 60, 0.65)',
    alignItems: 'center',
    textAlign: 'center',
    gap: 14,
  },
  scannerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  radarPulsingRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 152, 212, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 152, 212, 0.3)',
  },
  tickerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  tickerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34C759',
  },
  tickerText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.75)',
    fontWeight: '500',
  },
  heroAmountFact: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  cleanScannerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  monitoredLinesContainer: {
    width: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: 14,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  monitoredLinesLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.45)',
    letterSpacing: 0.8,
  },
  linePillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  lineTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 152, 212, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 152, 212, 0.3)',
  },
  lineTagDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0098D4',
  },
  lineTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  passiveReassuranceText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    lineHeight: 17,
  },

  // ── Statutory Disclosure Box ───
  statutoryCardOuter: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 20,
  },
  statutoryCardBlur: {
    padding: 14,
    backgroundColor: 'rgba(10, 15, 60, 0.5)',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  statutoryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  statutoryTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statutoryBody: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.55)',
    lineHeight: 15,
  },
  changePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 152, 212, 0.15)',
  },
  changePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0098D4',
    letterSpacing: 0.5,
  },

  // ── Banners & Overdue Badge ───
  bannerOuter: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
  },
  recoveredBanner: {
    padding: 16,
    backgroundColor: 'rgba(52, 199, 89, 0.15)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.35)',
  },
  pendingBanner: {
    padding: 16,
    backgroundColor: 'rgba(0, 152, 212, 0.15)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 152, 212, 0.35)',
  },
  bannerLabel: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
  },
  recoveredCaption: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 2,
  },
  recoveredAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#34C759',
  },
  pendingAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0098D4',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.35)',
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },
  badgeText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
    flex: 1,
  },

  // ── Claims List ───
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  sectionCount: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  cardOuter: {
    marginBottom: 16,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  cardBlur: {
    padding: 20,
    backgroundColor: 'rgba(10, 15, 60, 0.75)',
    gap: 12,
  },
  eligibleHeaderBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 184, 0, 0.15)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  eligibleHeaderBannerText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFB800',
    letterSpacing: 0.6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  amountText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  journeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  journeyLine: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '600',
  },
  stationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stationText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    flexShrink: 1,
  },
  causeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  causeText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.65)',
    lineHeight: 18,
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.45)',
  },
  delayBadge: {
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  delayText: {
    fontSize: 11,
    color: '#FF3B30',
    fontWeight: '700',
  },
  cappingDisclaimerBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    padding: 8,
    borderRadius: 8,
  },
  cappingDisclaimerText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.45)',
    lineHeight: 15,
  },
  unverifiedNoticeBox: {
    backgroundColor: 'rgba(0, 152, 212, 0.1)',
    padding: 10,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  unverifiedNoticeText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.75)',
    lineHeight: 16,
    flex: 1,
  },
  ineligibleNoticeBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 10,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  ineligibleNoticeText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 16,
    flex: 1,
  },

  // Actions
  actionContainer: {
    gap: 10,
    marginTop: 4,
  },
  primaryActionButton: {
    backgroundColor: '#0098D4',
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryActionText: {
    color: '#0A0F3C',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryActionButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  filedStatusBox: {
    backgroundColor: 'rgba(0, 152, 212, 0.1)',
    padding: 10,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filedStatusText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    flex: 1,
    lineHeight: 16,
  },
  receivedSuccessBox: {
    backgroundColor: 'rgba(52, 199, 89, 0.15)',
    padding: 10,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  receivedSuccessText: {
    fontSize: 13,
    color: '#34C759',
    fontWeight: '600',
  },

  // ── Quick Copy Accessory Bar ───
  accessoryBarOuter: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    marginTop: 4,
  },
  accessoryBarHeader: {
    gap: 2,
  },
  accessoryBarTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  accessoryBarTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0098D4',
    letterSpacing: 0.6,
  },
  accessoryBarSubtitle: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  copyChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  copyChipActive: {
    backgroundColor: 'rgba(52, 199, 89, 0.25)',
    borderColor: '#34C759',
  },
  copyChipText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // ── SLA Survey Modal ───
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
    borderColor: 'rgba(0, 152, 212, 0.3)',
    gap: 16,
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
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  surveyBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── Empty / Error State ───
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptySubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0098D4',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
})
