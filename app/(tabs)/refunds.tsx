// app/(tabs)/refunds.tsx
// Refund Radar — delay repay claims history with frosted glassmorphism & TfL radar explainer.
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
} from 'phosphor-react-native'
import { APP_CONFIG } from '../../config/app.config'
import { launchTflAuth } from '../../services/authSession'
import { ensureDeviceIdentity } from '../../services/deviceIdentity'
import { STATUS_SEVERITY_COLORS } from '../../utils/getSeverityColor'
import { DEMO_MODE } from '../../config/demoMode'
import { useRouter } from 'expo-router'
import { requestPermission, usePermissionOrchestrator } from '../../store/permissionOrchestrator'
import { useUserPreferencesStore } from '../../store/userPreferencesStore'
import { GLASS } from '../../theme/colors'

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
  filed:      { label: 'Filed — awaiting payment', color: '#4A9EFF', Icon: PaperPlaneRight },
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
      <BlurView intensity={45} tint="dark" style={styles.cardBlur}>
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
          <Train size={14} color="rgba(255,255,255,0.4)" weight="regular" />
          <Text style={styles.journeyLine}>
            {claim.lineId.charAt(0).toUpperCase() + claim.lineId.slice(1)}
          </Text>
        </View>

        <View style={styles.stationRow}>
          <Text style={styles.stationText} numberOfLines={1}>
            {claim.entryStation ?? 'Unknown'}
          </Text>
          <ArrowRight size={14} color="rgba(255,255,255,0.3)" weight="bold" />
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

// ── TfL Radar Explainer & Registration Card ───────────────────────────
// Fully embedded value proposition explaining why TfL registration unlocks 12 months vs 7 days.
const TflRadarExplainerCard = React.memo(({
  isRegistered,
  onRegister,
  onToggleRegistered,
}: {
  isRegistered: boolean
  onRegister: () => void
  onToggleRegistered: (val: boolean) => void
}) => {
  return (
    <View style={styles.explainerCardOuter}>
      <BlurView intensity={45} tint="dark" style={styles.explainerCardBlur}>
        {/* Accent Bar */}
        <View style={[styles.explainerAccentBar, isRegistered && { backgroundColor: '#34C759' }]} />

        <View style={styles.explainerInner}>
          {/* Header */}
          <View style={styles.explainerHeaderRow}>
            <View style={styles.explainerIconWrap}>
              <Broadcast size={20} color={isRegistered ? '#34C759' : '#0098D4'} weight="bold" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.explainerEyebrow}>
                {isRegistered ? '12-MONTH DELAY RADAR ACTIVE' : 'TFL DELAY REPAY ENGINE'}
              </Text>
              <Text style={styles.explainerTitle}>
                {isRegistered
                  ? 'Your TfL Account is Linked'
                  : 'One tap makes Refund Radar actually work'}
              </Text>
            </View>
          </View>

          <Text style={styles.explainerBody}>
            Refund Radar claims your delay money back from TfL. But it can only reach the journeys TfL lets it see.
          </Text>

          {/* Comparison Container */}
          <View style={styles.comparisonBox}>
            {/* Registered Row */}
            <View style={styles.compareItem}>
              <View style={[styles.compareIconPill, { backgroundColor: 'rgba(52, 199, 89, 0.15)' }]}>
                <LinkIcon size={18} color="#34C759" weight="bold" />
              </View>
              <View style={styles.compareTextCol}>
                <View style={styles.compareTitleRow}>
                  <Text style={styles.compareHeading}>Registered with TfL</Text>
                  {isRegistered && (
                    <View style={styles.activePill}>
                      <Text style={styles.activePillText}>ACTIVE</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.compareBody}>
                  12 months of claimable journey history. Refund Radar can reach nearly every delay you were owed.
                </Text>
              </View>
            </View>

            <View style={styles.comparisonDivider} />

            {/* Not Registered Row */}
            <View style={styles.compareItem}>
              <View style={[styles.compareIconPill, { backgroundColor: 'rgba(255, 255, 255, 0.08)' }]}>
                <LinkBreak size={18} color="rgba(255, 255, 255, 0.5)" weight="bold" />
              </View>
              <View style={styles.compareTextCol}>
                <Text style={[styles.compareHeading, { color: 'rgba(255,255,255,0.7)' }]}>Not registered</Text>
                <Text style={styles.compareBody}>
                  Just 7 days of history. Most delays fall outside that window, so Refund Radar is nearly useless until you register.
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

          {/* Action CTAs */}
          {!isRegistered ? (
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
          ) : (
            <View style={styles.registeredControlsRow}>
              <Pressable
                onPress={onRegister}
                style={({ pressed }) => [
                  styles.reopenPortalBtn,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <ArrowSquareOut size={14} color="#FFFFFF" weight="bold" />
                <Text style={styles.reopenPortalBtnText}>Open TfL Contactless Portal</Text>
              </Pressable>

              <Pressable
                onPress={() => onToggleRegistered(false)}
                hitSlop={8}
              >
                <Text style={styles.disconnectLink}>Change</Text>
              </Pressable>
            </View>
          )}
        </View>
      </BlurView>
    </View>
  )
})
TflRadarExplainerCard.displayName = 'TflRadarExplainerCard'

// ── Main Screen ───────────────────────────────────────────────────────

export default function RefundsScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const notificationsGranted = useUserPreferencesStore(s => s.notificationsGranted)
  const tflRegistered = useUserPreferencesStore(s => s.tflRegistered)
  const setTflRegistered = useUserPreferencesStore(s => s.setTflRegistered)
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

  // Optimistic loop update: PATCH the server, then re-fetch.
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

  // Header content rendered at top of FlatList
  const renderHeader = () => (
    <View>
      {/* Title */}
      <View style={styles.header}>
        <Text style={styles.title}>Refund Radar</Text>
        <Text style={styles.subtitle}>Automatic delay detection & claims</Text>
      </View>

      {/* Explainer & Connection Hero Card */}
      <TflRadarExplainerCard
        isRegistered={tflRegistered}
        onRegister={handleRegisterWithTfl}
        onToggleRegistered={handleToggleRegistered}
      />

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
          onValueChange={async (value) => {
            if (value) {
              const decision = await requestPermission('notifications', 'refund_status', { primer: false });
              if (decision !== 'granted') return;
            }
          }}
          trackColor={{ false: '#374151', true: '#007AFF' }}
          thumbColor="#FFFFFF"
        />
      </View>

      {/* Recovered-so-far banner */}
      {recoveredFormatted && (
        <View style={styles.bannerOuter}>
          <BlurView intensity={45} tint="dark" style={styles.recoveredBanner}>
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
          <BlurView intensity={45} tint="dark" style={styles.pendingBanner}>
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

      {/* Claims List Header Label */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Detected Claims</Text>
        {data && data.claims.length > 0 && (
          <Text style={styles.sectionCount}>{data.claims.length} total</Text>
        )}
      </View>
    </View>
  )

  // Empty state renderer
  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="rgba(255,255,255,0.4)" />
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

    return (
      <View style={styles.emptyContainer}>
        <View style={styles.radarPulsingRing}>
          <Broadcast size={36} color="#0098D4" weight="bold" />
        </View>
        <Text style={styles.emptyTitle}>Radar Active & Listening</Text>
        <Text style={styles.emptySubtitle}>
          Delays over 15 minutes on your commute lines will be automatically detected and appear here ready to claim.
        </Text>
      </View>
    )
  }

  return (
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
            tintColor="rgba(255,255,255,0.4)"
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
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
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },

  // ── Explainer Card ──────────────────────────────────────────────────
  explainerCardOuter: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  explainerCardBlur: {
    borderRadius: 22,
    backgroundColor: GLASS.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
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
    backgroundColor: 'rgba(0,152,212,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  explainerEyebrow: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
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
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 14,
  },

  // Comparison Box
  comparisonBox: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
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
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  compareTextCol: {
    flex: 1,
  },
  compareTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  compareHeading: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 15,
    color: '#FFFFFF',
  },
  activePill: {
    backgroundColor: 'rgba(52, 199, 89, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  activePillText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 10,
    color: '#34C759',
  },
  compareBody: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.65)',
  },
  comparisonDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 12,
  },

  // Security Note
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
    color: 'rgba(255,255,255,0.5)',
  },

  // CTAs
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
    color: 'rgba(255,255,255,0.5)',
    textDecorationLine: 'underline',
  },
  registeredControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  reopenPortalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  reopenPortalBtnText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 12.5,
    color: '#FFFFFF',
  },
  disconnectLink: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    textDecorationLine: 'underline',
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
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
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
    color: 'rgba(255,255,255,0.6)',
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
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  recoveredBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(52,199,89,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(52,199,89,0.35)',
    overflow: 'hidden',
  },
  bannerLabel: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
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
    color: '#34C759',
    letterSpacing: -0.3,
  },
  recoveredCaption: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(52,199,89,0.7)',
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
    color: 'rgba(255,255,255,0.6)',
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
    color: 'rgba(255,255,255,0.4)',
  },

  // ── Claim Card ──────────────────────────────────────────────────────
  cardOuter: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  cardBlur: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
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
    backgroundColor: 'rgba(255,255,255,0.04)',
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
    color: 'rgba(255,255,255,0.5)',
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
    color: 'rgba(255,255,255,0.9)',
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
    color: 'rgba(255,255,255,0.4)',
  },
  delayBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(255,184,0,0.12)',
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
    borderColor: 'rgba(255, 255, 255, 0.25)',
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
    backgroundColor: 'rgba(74,158,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(74,158,255,0.45)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  receivedButton: {
    backgroundColor: 'rgba(52,199,89,0.15)',
    borderColor: 'rgba(52,199,89,0.40)',
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
    backgroundColor: 'rgba(255,184,0,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,184,0,0.30)',
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
    color: 'rgba(52,199,89,0.7)',
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
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(0,152,212,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,152,212,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 18,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
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
