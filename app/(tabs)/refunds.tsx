// app/(tabs)/refunds.tsx
// Refund Radar — clean delay repay claims history & active radar tracking.
//
// The "Did you get it?" loop (v10 spec):
//   Eligible (app-detected) → Filed (user taps "I filed my claim") →
//   Received (user taps "Money received").
//   filed/received are self-reported — the app cannot see TfL's side. Two
//   buttons, not one: a single button would leave "received" permanently
//   unknown and the loop never closes.

import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Switch,
  Linking,
  Image,
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
} from 'phosphor-react-native'
import { APP_CONFIG } from '../../config/app.config'
import { launchTflAuth } from '../../services/authSession'
import { ensureDeviceIdentity } from '../../services/deviceIdentity'
import { STATUS_SEVERITY_COLORS } from '../../utils/getSeverityColor'
import { DEMO_MODE } from '../../config/demoMode'
import { useRouter } from 'expo-router'
import { requestPermission, usePermissionOrchestrator } from '../../store/permissionOrchestrator'
import { useUserPreferencesStore } from '../../store/userPreferencesStore'
import { tflCapitalise } from '../../utils/tflCapitalise'
import { OnboardingGradient } from '../../components/OnboardingGradient'

// ── Operational Constants ─────────────────────────────────────────────
// TFL_CONTACTLESS_PORTAL_URL: Official TfL contactless & Oyster journey history portal
const TFL_CONTACTLESS_PORTAL_URL = 'https://contactless.tfl.gov.uk/'

// DUE_CLAIM_WORKING_DAYS: Standard 10 working-day window TfL takes to process delay repay
const DUE_CLAIM_WORKING_DAYS = 10

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
}

interface ClaimsResponse {
  claims: Claim[]
  pendingTotal: number
  recoveredTotal: number
  count: number
}

// ── Status display config ─────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; Icon: React.ComponentType<{ size?: number; color?: string; weight?: any }> }> = {
  eligible:   { label: 'Eligible — file on TfL', color: '#FFB800', Icon: WarningCircle },
  filed:      { label: 'Filed — awaiting payment', color: '#0098D4', Icon: PaperPlaneRight },
  received:   { label: 'Received', color: '#34C759', Icon: CheckCircle },
  ineligible: { label: 'Not Eligible', color: 'rgba(255,255,255,0.35)', Icon: WarningCircle },
  expired:    { label: 'Expired', color: 'rgba(255,255,255,0.2)', Icon: Clock },
}

function loopState(claim: Claim): 'eligible' | 'filed' | 'received' | 'closed' {
  if (claim.claimStatus) return claim.claimStatus
  if (claim.status === 'detected' || claim.status === 'notified') return 'eligible'
  return 'closed'
}

function addWorkingDays(from: Date, days: number): Date {
  const d = new Date(from)
  let remaining = days
  while (remaining > 0) {
    d.setDate(d.getDate() + 1)
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) remaining--
  }
  return d
}

function isOverdue(claim: Claim): boolean {
  if (claim.claimStatus !== 'filed' || !claim.filedAt) return false
  const due = addWorkingDays(new Date(claim.filedAt), DUE_CLAIM_WORKING_DAYS)
  return new Date() > due
}

function workingDaysSince(fromIso: string): number {
  const from = new Date(fromIso)
  let count = 0
  const now = new Date()
  const cursor = new Date(from)
  while (cursor < now) {
    cursor.setDate(cursor.getDate() + 1)
    const dow = cursor.getDay()
    if (dow !== 0 && dow !== 6) count++
  }
  return count
}

function formatPence(pence: number): string {
  return (pence / 100).toLocaleString('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
  })
}

// ── Claim Card ────────────────────────────────────────────────────────

const ClaimCard = React.memo(({ claim, onUpdate, updating }: {
  claim: Claim
  onUpdate: (id: number, next: 'filed' | 'received') => void
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

  return (
    <View style={styles.cardOuter}>
      <BlurView intensity={30} tint="dark" style={styles.cardBlur}>
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
            {claim.lineId.charAt(0).toUpperCase() + claim.lineId.slice(1)}
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

        {/* Bottom metadata */}
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{dateStr}</Text>
          {claim.causeEligible && (
            <View style={styles.delayBadge}>
              <Text style={styles.delayText}>{claim.delayMinutes}m delay</Text>
            </View>
          )}
        </View>

        {/* Loop actions */}
        {state === 'eligible' && (
          <View style={styles.actionButtonContainer}>
            <Pressable
              onPress={async () => {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                const evidence = JSON.stringify({
                  date: dateStr,
                  line: claim.lineId,
                  delay: `${claim.delayMinutes}min`,
                  entry: claim.entryStation,
                  exit: claim.exitStation,
                  amount: formatPence(claim.amountPence),
                }, null, 2)
                await Clipboard.setStringAsync(evidence)
                launchTflAuth('refund_radar')
              }}
              style={({ pressed }) => [
                styles.fileClaimButton,
                pressed && { opacity: 0.7 },
              ]}
            >
              <ArrowSquareOut size={14} color="#FFFFFF" weight="bold" style={{ marginRight: 6 }} />
              <Text style={styles.fileClaimButtonText}>File Claim on TfL (Copies Details)</Text>
            </Pressable>

            <Pressable
              onPress={async () => {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
                onUpdate(claim.id, 'filed')
              }}
              disabled={updating === 'filed'}
              style={({ pressed }) => [
                styles.loopButton,
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="I filed my claim"
            >
              {updating === 'filed' ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <PaperPlaneRight size={15} color="#FFFFFF" weight="bold" style={{ marginRight: 6 }} />
                  <Text style={styles.loopButtonText}>I filed my claim</Text>
                </>
              )}
            </Pressable>
          </View>
        )}

        {state === 'filed' && (
          <View style={styles.actionButtonContainer}>
            {overdue && (
              <View style={styles.overdueBanner}>
                <Clock size={14} color="#FFB800" weight="bold" style={{ marginRight: 6 }} />
                <Text style={styles.overdueText}>
                  Filed {workingDaysSince(claim.filedAt!)} working days ago. Landed yet?
                </Text>
              </View>
            )}
            <Pressable
              onPress={async () => {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
                onUpdate(claim.id, 'received')
              }}
              disabled={updating === 'received'}
              style={({ pressed }) => [
                styles.loopButton,
                styles.receivedButton,
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Money received"
            >
              {updating === 'received' ? (
                <ActivityIndicator size="small" color="#34C759" />
              ) : (
                <>
                  <CheckCircle size={15} color="#34C759" weight="bold" style={{ marginRight: 6 }} />
                  <Text style={[styles.loopButtonText, { color: '#34C759' }]}>Money received</Text>
                </>
              )}
            </Pressable>
          </View>
        )}

        {state === 'received' && claim.receivedAt && (
          <Text style={styles.receivedMeta}>
            Received {new Date(claim.receivedAt).toLocaleDateString('en-GB', {
              day: 'numeric', month: 'short',
            })} — added to your running total
          </Text>
        )}
      </BlurView>
    </View>
  )
})
ClaimCard.displayName = 'ClaimCard'

// ── UNREGISTERED ONLY: Educational Pitch Card ─────────────────────────
// Clean Light Blue accents matching 3rd onboarding screen.
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
        <View style={styles.explainerAccentBar} />

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

          {/* Comparison Container */}
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
              Takes about a minute. We send you to TfL to sign in — your card details never touch this app.
            </Text>
          </View>

          {/* CTAs */}
          <View style={styles.ctaGroup}>
            <Pressable
              onPress={onRegister}
              style={({ pressed }) => [
                styles.registerPrimaryCta,
                pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Register with TfL"
            >
              <ArrowSquareOut size={18} color="#0A0F3C" weight="bold" />
              <Text style={styles.registerPrimaryCtaText}>Register with TfL</Text>
            </Pressable>

            <Pressable
              onPress={() => onToggleRegistered(true)}
              style={({ pressed }) => [
                styles.alreadyRegisteredBtn,
                pressed && { opacity: 0.7 },
              ]}
              hitSlop={8}
            >
              <Text style={styles.alreadyRegisteredBtnText}>I already have a registered TfL account</Text>
            </Pressable>
          </View>
        </View>
      </BlurView>
    </View>
  )
})
TflUnregisteredPitchCard.displayName = 'TflUnregisteredPitchCard'

// ── REGISTERED ONLY: Clean Minimal Active Status Bar ──────────────────
// Pure Light Blue indicator matching the design system.
const TflRegisteredCleanStatusBar = React.memo(({
  monitoredLineCount,
}: {
  monitoredLineCount: number
}) => {
  return (
    <View style={styles.registeredStatusBarOuter}>
      <BlurView intensity={30} tint="dark" style={styles.registeredStatusBarBlur}>
        <View style={styles.registeredStatusLeft}>
          <View style={styles.pulsingBlueDot}>
            <View style={styles.pulsingBlueDotInner} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.statusTitleRow}>
              <Text style={styles.registeredStatusTitle}>28-Day Delay Radar Active</Text>
              <View style={styles.connectedPill}>
                <Text style={styles.connectedPillText}>CONNECTED</Text>
              </View>
            </View>
            <Text style={styles.registeredStatusSubtitle}>
              Monitoring {monitoredLineCount} saved {monitoredLineCount === 1 ? 'line' : 'lines'} for 15+ min qualifying delays
            </Text>
          </View>
        </View>
      </BlurView>
    </View>
  )
})
TflRegisteredCleanStatusBar.displayName = 'TflRegisteredCleanStatusBar'

// ── REGISTERED ZERO-STATE: Clean Live Radar & Potential Refunds ───────
// Rendered when user is registered and has 0 active claims.
const CleanRadarLiveScanner = React.memo(({
  savedLines,
}: {
  savedLines: string[]
}) => {
  return (
    <View style={styles.cleanScannerOuter}>
      <BlurView intensity={30} tint="dark" style={styles.cleanScannerBlur}>
        <View style={styles.radarPulsingRing}>
          <Broadcast size={36} color="#0098D4" weight="bold" />
        </View>
        <Text style={styles.cleanScannerTitle}>Radar Active & Scanning</Text>
        <Text style={styles.cleanScannerSubtitle}>
          We are monitoring live track telemetry for delays over 15 minutes across your commute routes.
        </Text>

        {savedLines.length > 0 && (
          <View style={styles.monitoredLinesContainer}>
            <Text style={styles.monitoredLinesLabel}>ACTIVE COMMUTE RADAR</Text>
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

        <View style={styles.guideNoticeRow}>
          <Sparkle size={15} color="#0098D4" weight="fill" style={{ marginTop: 2 }} />
          <Text style={styles.guideNoticeText}>
            Delays of 15+ minutes qualify for a full single-fare TfL refund. When a delay occurs on your lines, it will appear here automatically ready to claim in 1 tap.
          </Text>
        </View>
      </BlurView>
    </View>
  )
})
CleanRadarLiveScanner.displayName = 'CleanRadarLiveScanner'

// ── Main Screen ───────────────────────────────────────────────────────

export default function RefundsScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const notificationsGranted = useUserPreferencesStore(s => s.notificationsGranted)
  const setNotificationsGranted = useUserPreferencesStore(s => s.setNotificationsGranted)
  const tflRegistered = useUserPreferencesStore(s => s.tflRegistered)
  const setTflRegistered = useUserPreferencesStore(s => s.setTflRegistered)
  const selectedLines = useUserPreferencesStore(s => s.selectedLines)
  const notifDenied = usePermissionOrchestrator(s => s.permissions.notifications?.decision === 'denied')
  const openAppSettings = useCallback(() => { Linking.openSettings().catch(() => {}) }, [])

  const [data, setData] = useState<ClaimsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState<Record<number, 'filed' | 'received'>>({})

  // Phase 7 #14: demo builds must never surface Refund Radar
  useEffect(() => {
    if (DEMO_MODE) {
      router.replace('/(tabs)')
    }
  }, [router])

  // Direct registration handler (opens TfL portal in-app web browser and marks registered)
  const handleRegisterWithTfl = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setTflRegistered(true)
    try {
      await WebBrowser.openBrowserAsync(TFL_CONTACTLESS_PORTAL_URL)
    } catch {
      await Linking.openURL(TFL_CONTACTLESS_PORTAL_URL).catch(() => {})
    }
  }, [setTflRegistered])

  const handleToggleRegistered = useCallback(async (val: boolean) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setTflRegistered(val)
  }, [setTflRegistered])

  const handleToggleNotificationSwitch = useCallback(async (value: boolean) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    if (value) {
      const decision = await requestPermission('notifications', 'refund_status', { primer: false })
      if (decision === 'granted') {
        setNotificationsGranted(true)
      }
    } else {
      setNotificationsGranted(false)
    }
  }, [setNotificationsGranted])

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
      setError('Could not load claims. Pull down to retry.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchClaims() }, [fetchClaims])

  // Permission 4 — the Always-location money ask. Fires ONCE, the first time
  // an eligible (app-detected, not yet filed) claim is on screen.
  const alwaysAskFiredRef = useRef(false)
  useEffect(() => {
    if (alwaysAskFiredRef.current) return
    const eligible = (data?.claims ?? []).find(
      c => c.status === 'detected' || c.status === 'notified'
    )
    if (!eligible) return
    alwaysAskFiredRef.current = true
    const amount = formatPence(eligible.amountPence)
    void requestPermission('locationAlways', 'first_eligible_claim', {
      copy: {
        title: 'YOU MISSED A DELAY. WE DIDN\u2019T.',
        body: `${amount} might be sitting there because of that delay. Let us track your Home–Work route in the background and we\u2019ll flag every one like this — no more digging through old journeys yourself.`,
        button: 'Never Miss One',
      },
    })
  }, [data])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchClaims(true)
  }, [fetchClaims])

  // Optimistic loop update
  const updateClaim = useCallback(async (id: number, next: 'filed' | 'received') => {
    setUpdating(prev => ({ ...prev, [id]: next }))
    try {
      const { userId, apiKey } = await ensureDeviceIdentity()
      const res = await fetch(`${APP_CONFIG.BACKEND_API_URL}/api/claims/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-api-key': apiKey,
        },
        body: JSON.stringify({ claimStatus: next }),
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

      {/* State-Adaptive Header: Pitch card if NOT registered, clean status bar if REGISTERED */}
      {!tflRegistered ? (
        <TflUnregisteredPitchCard
          onRegister={handleRegisterWithTfl}
          onToggleRegistered={handleToggleRegistered}
        />
      ) : (
        <TflRegisteredCleanStatusBar
          monitoredLineCount={selectedLines.length}
        />
      )}

      {/* Claim alerts permission toggle */}
      <View style={styles.claimAlertsRow}>
        <View style={styles.claimAlertsInfo}>
          <Text style={styles.claimAlertsTitle}>Claim status alerts</Text>
          <Text style={styles.claimAlertsBody}>
            {"Money doesn't announce itself. We will, the second it moves."}
          </Text>
          {notifDenied && (
            <Pressable onPress={openAppSettings} hitSlop={8}>
              <Text style={styles.denialLine}>
                Notifications are off for My Commute — tap to fix in Settings
              </Text>
            </Pressable>
          )}
        </View>
        <Switch
          value={notificationsGranted}
          onValueChange={handleToggleNotificationSwitch}
          trackColor={{ false: 'rgba(255,255,255,0.2)', true: '#0098D4' }}
          thumbColor="#FFFFFF"
        />
      </View>

      {/* Recovered-so-far banner */}
      {recoveredFormatted && (
        <View style={styles.bannerOuter}>
          <BlurView intensity={30} tint="dark" style={styles.recoveredBanner}>
            <View>
              <Text style={styles.bannerLabel}>Recovered so far</Text>
              <Text style={styles.recoveredCaption}>{"Money you've told us landed"}</Text>
            </View>
            <Text style={styles.recoveredAmount}>{recoveredFormatted}</Text>
          </BlurView>
        </View>
      )}

      {/* Pending refunds banner */}
      {data && data.pendingTotal > 0 && (
        <View style={styles.bannerOuter}>
          <BlurView intensity={30} tint="dark" style={styles.pendingBanner}>
            <Text style={styles.bannerLabel}>Pending refunds</Text>
            <Text style={styles.pendingAmount}>{pendingFormatted}</Text>
          </BlurView>
        </View>
      )}

      {/* Overdue badge */}
      {badgeCount > 0 && (
        <View style={styles.badgeRow}>
          <View style={styles.badgeDot} />
          <Text style={styles.badgeText}>
            {badgeCount} filed {badgeCount === 1 ? 'claim is' : 'claims are'} past {DUE_CLAIM_WORKING_DAYS} working days — did the money land?
          </Text>
        </View>
      )}

      {/* Claims List Header Label (Only if claims exist) */}
      {hasClaims && (
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

    // Registered with 0 claims: clean live scanning hub
    if (tflRegistered) {
      return <CleanRadarLiveScanner savedLines={selectedLines} />
    }

    // Unregistered empty placeholder
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.radarPulsingRing}>
          <Broadcast size={36} color="#0098D4" weight="bold" />
        </View>
        <Text style={styles.emptyTitle}>Radar Ready & Listening</Text>
        <Text style={styles.emptySubtitle}>
          Connect your TfL account above to unlock 28 days of automatic delay detection on your commutes.
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.rootContainer}>
      {/* Signature Deep TfL Navy/Midnight Blue Gradient */}
      <OnboardingGradient />

      {/* Film Grain Texture Overlay */}
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        <Image
          source={require('../../assets/images/grain.png')}
          style={[StyleSheet.absoluteFillObject, { opacity: 0.03 }]}
          resizeMode="repeat"
        />
      </View>

      <View style={[styles.container, { paddingTop: insets.top }]}>
        <FlatList
          data={data?.claims ?? []}
          keyExtractor={item => String(item.id)}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          renderItem={({ item }) => (
            <ClaimCard claim={item} onUpdate={updateClaim} updating={updating[item.id]} />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="rgba(255,255,255,0.6)"
            />
          }
          showsVerticalScrollIndicator={false}
        />
      </View>
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#07103a',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 34,
    color: '#FFFFFF',
    letterSpacing: -0.8,
  },
  subtitle: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },

  // ── Unregistered Pitch Card ─────────────────────────────────────────
  explainerCardOuter: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  explainerCardBlur: {
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  explainerAccentBar: {
    height: 4,
    backgroundColor: '#0098D4',
  },
  explainerInner: {
    padding: 18,
  },
  explainerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  explainerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,152,212,0.20)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,152,212,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  explainerEyebrow: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1.1,
  },
  explainerTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 20,
    color: '#FFFFFF',
    letterSpacing: -0.4,
    lineHeight: 24,
    marginTop: 2,
  },
  explainerBody: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 14,
  },
  comparisonBox: {
    backgroundColor: 'rgba(0, 16, 56, 0.45)',
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
    marginBottom: 14,
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
    backgroundColor: 'rgba(0, 152, 212, 0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 152, 212, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  compareTextCol: {
    flex: 1,
  },
  compareHeading: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 15,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  compareBody: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.70)',
  },
  comparisonDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: 12,
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 16,
  },
  securityText: {
    flex: 1,
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12.5,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.55)',
  },
  ctaGroup: {
    gap: 10,
  },
  registerPrimaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    height: 48,
    gap: 8,
    shadowColor: '#0098D4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  registerPrimaryCtaText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 15,
    color: '#0A0F3C',
  },
  alreadyRegisteredBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  alreadyRegisteredBtnText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    textDecorationLine: 'underline',
  },

  // ── Registered Clean Status Bar ─────────────────────────────────────
  registeredStatusBarOuter: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  registeredStatusBarBlur: {
    borderRadius: 16,
    backgroundColor: 'rgba(0, 152, 212, 0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 152, 212, 0.35)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  registeredStatusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  pulsingBlueDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 152, 212, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulsingBlueDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0098D4',
  },
  statusTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  registeredStatusTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  connectedPill: {
    backgroundColor: 'rgba(0, 152, 212, 0.22)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 152, 212, 0.45)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  connectedPillText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 9,
    color: '#0098D4',
    letterSpacing: 0.5,
  },
  registeredStatusSubtitle: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 1,
  },

  // ── Clean Radar Live Scanner (Zero-State for Registered) ───────────
  cleanScannerOuter: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
  cleanScannerBlur: {
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.20)',
    padding: 22,
    overflow: 'hidden',
    alignItems: 'center',
  },
  cleanScannerTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 20,
    color: '#FFFFFF',
    letterSpacing: -0.4,
    marginBottom: 6,
    textAlign: 'center',
  },
  cleanScannerSubtitle: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: 16,
  },
  monitoredLinesContainer: {
    width: '100%',
    backgroundColor: 'rgba(0, 16, 56, 0.45)',
    borderRadius: 14,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: 14,
  },
  monitoredLinesLabel: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 10.5,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
    marginBottom: 8,
  },
  linePillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  lineTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  lineTagDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0098D4',
  },
  lineTagText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 12,
    color: '#FFFFFF',
  },
  guideNoticeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(0, 152, 212, 0.12)',
    borderRadius: 12,
    padding: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 152, 212, 0.3)',
    width: '100%',
  },
  guideNoticeText: {
    flex: 1,
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12.5,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.85)',
  },

  // ── Alerts Toggle ───────────────────────────────────────────────────
  claimAlertsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
    gap: 12,
  },
  claimAlertsInfo: {
    flex: 1,
  },
  claimAlertsTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 15,
    color: '#FFFFFF',
  },
  claimAlertsBody: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 2,
  },
  denialLine: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 12,
    color: STATUS_SEVERITY_COLORS.minor,
    marginTop: 4,
    textDecorationLine: 'underline',
  },

  // ── Banners ─────────────────────────────────────────────────────────
  bannerOuter: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  pendingBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.20)',
    overflow: 'hidden',
  },
  recoveredBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 152, 212, 0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 152, 212, 0.35)',
    overflow: 'hidden',
  },
  bannerLabel: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 15,
    color: 'rgba(255,255,255,0.75)',
  },
  pendingAmount: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 22,
    color: '#FFB800',
    letterSpacing: -0.3,
  },
  recoveredAmount: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 22,
    color: '#0098D4',
    letterSpacing: -0.3,
  },
  recoveredCaption: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(0, 152, 212, 0.8)',
    marginTop: 2,
  },

  // Overdue badge
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFB800',
  },
  badgeText: {
    flex: 1,
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
  },

  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  sectionTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 18,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  sectionCount: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },

  // ── Claim Card ──────────────────────────────────────────────────────
  cardOuter: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  cardBlur: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.20)',
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  statusLabel: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  amountText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 20,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  journeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  journeyLine: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'capitalize',
  },
  stationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  stationText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 15,
    color: 'rgba(255,255,255,0.95)',
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
  },
  delayBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(255,184,0,0.15)',
  },
  delayText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 12,
    color: '#FFB800',
  },
  actionButtonContainer: {
    marginTop: 10,
    gap: 8,
  },
  fileClaimButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  fileClaimButtonText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 13,
    color: '#FFFFFF',
  },
  loopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 152, 212, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(0, 152, 212, 0.5)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  receivedButton: {
    backgroundColor: 'rgba(52,211,153,0.18)',
    borderColor: 'rgba(52,211,153,0.45)',
  },
  loopButtonText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 13,
    color: '#FFFFFF',
  },
  overdueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,184,0,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,184,0,0.35)',
  },
  overdueText: {
    flex: 1,
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 12,
    color: '#FFB800',
  },
  receivedMeta: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(52,211,153,0.85)',
    marginTop: 10,
  },

  // ── Empty / Loading ─────────────────────────────────────────────────
  listContent: {
    paddingBottom: 120,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 36,
  },
  radarPulsingRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0,152,212,0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(0,152,212,0.50)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#0098D4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 6,
  },
  emptyTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 18,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 16,
  },
  retryButtonText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 14,
    color: '#FFFFFF',
  },
})
