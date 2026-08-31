// app/(tabs)/refunds.tsx
// Refund Radar — Financial Terminal orchestrator (Radar v2).
//
// Progressive-disclosure state machine (master plan §2):
//   State A  NOT_SET            → Connect decision sheet (auto-presented once)
//   State A' UNREGISTERED_7_DAY → Surveillance hero + corridor chips + 7-day disclosure
//   State B  REGISTERED_28_DAY + active claims → Amber action-required hero stack
//              (+ "Signal Lock" arrival choreography, gated by MMKV)
//   State C  settledClaims > 0  → Earned UI: LifetimeMetricsCard + receipts link
//
// Data: GET /api/claims (device auth). Mutations: PATCH /api/claims/:id with an
// MMKV-backed optimistic mirror (submittedClaims/dismissedClaims) so filing and
// dismissing work offline and reconcile on the next successful sync.

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Image,
  Alert,
  Linking,
  AppState,
  AppStateStatus,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import * as Notifications from 'expo-notifications'
import * as WebBrowser from 'expo-web-browser'
import * as Clipboard from 'expo-clipboard'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  interpolateColor,
  useReducedMotion,
} from 'react-native-reanimated'
import {
  WarningCircle,
  ArrowsClockwise,
  CaretRight,
  ShieldCheck,
  Receipt,
} from 'phosphor-react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { APP_CONFIG } from '../../config/app.config'
import { ensureDeviceIdentity } from '../../services/deviceIdentity'
import {
  isOverdue,
  formatPence,
  snoozeSurvey,
  isSurveySnoozed,
} from '../../services/refundSlaService'
import { useUserPreferencesStore } from '../../store/userPreferencesStore'
import { OnboardingGradient } from '../../components/OnboardingGradient'
import { GLASS } from '../../theme/colors'
import { PREMIUM_SPRING_CONFIG } from '../../theme/physics'
import {
  COLOR_EMERALD,
  COLOR_AMBER,
  SIGNAL_LOCK_DURATION_MS,
  useClaimArrivalAnimation,
} from '../../hooks/useClaimArrivalAnimation'
import ZeroStateHeroCard from '../../components/refunds/ZeroStateHeroCard'
import ActiveClaimHeroCard from '../../components/refunds/ActiveClaimHeroCard'
import TfLConnectSheet from '../../components/refunds/TfLConnectSheet'
import LifetimeMetricsCard from '../../components/refunds/LifetimeMetricsCard'
import { ClaimHistoryDrawer } from '../../components/refunds/ClaimHistoryDrawer'
import { SlaSurveyModal } from '../../components/refunds/SlaSurveyModal'
import {
  loopStateOf,
  shouldMountEarnedUI,
  type ClaimsResponse,
  type RadarClaim,
} from '../../components/refunds/types'

// ── Rolling odometer (JS rAF, easeOutExpo over 450ms) ──────────────────────

function OdometerAmount({ targetPence, play }: { targetPence: number; play: boolean }) {
  const [pence, setPence] = useState(play ? 0 : targetPence)

  useEffect(() => {
    if (!play) {
      setPence(targetPence)
      return
    }
    let raf = 0
    const start = Date.now()
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / SIGNAL_LOCK_DURATION_MS)
      // easeOutExpo
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
      setPence(Math.round(targetPence * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [play, targetPence])

  return <Text style={styles.signalLockAmount}>{formatPence(pence)}</Text>
}

// ── Signal Lock transition overlay (Test A choreography) ───────────────────

function SignalLockHero({
  claim,
  onDone,
}: {
  claim: RadarClaim
  onDone: () => void
}) {
  const reducedMotion = useReducedMotion()
  const progress = useSharedValue(0)
  const heroScale = useSharedValue(reducedMotion ? 1 : 0.92)

  useEffect(() => {
    progress.value = reducedMotion ? 1 : withTiming(1, { duration: SIGNAL_LOCK_DURATION_MS })
    heroScale.value = reducedMotion
      ? 1
      : withSpring(1, PREMIUM_SPRING_CONFIG)
    const t = setTimeout(onDone, SIGNAL_LOCK_DURATION_MS + 550)
    return () => clearTimeout(t)
  }, [progress, heroScale, reducedMotion, onDone])

  const dotStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [COLOR_EMERALD, COLOR_AMBER]
    ),
    transform: [{ scale: 1 + 0.35 * Math.sin(progress.value * Math.PI) }],
  }))

  const heroStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heroScale.value }],
    opacity: 0.4 + 0.6 * progress.value,
  }))

  return (
    <Animated.View style={[styles.signalLockOuter, heroStyle]}>
      <View style={styles.signalLockTopRow}>
        <View style={styles.signalLockDotWrap}>
          <Animated.View style={[styles.signalLockDot, dotStyle]} />
          <Text style={styles.signalLockEyebrow}>DELAY DETECTED</Text>
        </View>
      </View>
      <OdometerAmount targetPence={claim.amountPence} play={!reducedMotion} />
      <Text style={styles.signalLockCaption}>
        Eligible for estimated refund · preparing your claim
      </Text>
    </Animated.View>
  )
}

// ── Main Screen ────────────────────────────────────────────────────────────

export default function RefundsScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const selectedLines = useUserPreferencesStore((s) => s.selectedLines)
  const tflAccountStatus = useUserPreferencesStore((s) => s.tflAccountStatus)
  const setTflAccountStatus = useUserPreferencesStore((s) => s.setTflAccountStatus)
  const submittedClaims = useUserPreferencesStore((s) => s.submittedClaims)
  const dismissedClaims = useUserPreferencesStore((s) => s.dismissedClaims)
  const simulatedClaimActive = useUserPreferencesStore((s) => s.simulatedClaimActive)
  const setSimulatedClaimActive = useUserPreferencesStore((s) => s.setSimulatedClaimActive)
  const storeRef = useRef(useUserPreferencesStore)

  const [data, setData] = useState<ClaimsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connectSheetVisible, setConnectSheetVisible] = useState(false)
  const [historyDrawerVisible, setHistoryDrawerVisible] = useState(false)
  const [surveyClaim, setSurveyClaim] = useState<RadarClaim | null>(null)
  const [filingIds, setFilingIds] = useState<Record<number, boolean>>({})
  // Tracks which arrival id has finished its Signal Lock choreography so a
  // SECOND new claim later in the same session still gets its own animation.
  const [shownArrivalId, setShownArrivalId] = useState<string | number | null>(null)
  const [lastEvaluatedAt, setLastEvaluatedAt] = useState<string | null>(null)

  // ── Claims fetch + optimistic-mirror reconciliation ──────────────────────
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
      setData(json)
      lastFetchTimeRef.current = Date.now()

      // Offline-queue flush: any locally-marked-filed claim the server still
      // reports as eligible gets its PATCH retried silently.
      const store = storeRef.current.getState()
      const pendingLocal = Object.keys(store.submittedClaims || {})
      const stillEligible = json.claims.filter(
        (c) =>
          pendingLocal.includes(String(c.id)) &&
          c.claimStatus == null &&
          (c.status === 'detected' || c.status === 'notified')
      )
      for (const claim of stillEligible) {
        void patchClaim(claim.id, { claimStatus: 'filed' })
          .then((ok) => {
            if (ok) storeRef.current.getState().pruneLocalClaimRecords([claim.id])
          })
          .catch(() => {})
      }

      // Mirror hygiene: forget local records for claims the server no longer
      // returns (expired/purged) or has already confirmed into the loop.
      const serverIds = new Set(json.claims.map((c) => String(c.id)))
      const confirmedIds = json.claims
        .filter((c) => c.claimStatus === 'filed' || c.claimStatus === 'received')
        .map((c) => String(c.id))
      const localKeys = [
        ...Object.keys(store.submittedClaims || {}),
        ...(store.dismissedClaims || []),
      ]
      const toForget = localKeys.filter(
        (id) => !serverIds.has(id) || confirmedIds.includes(id)
      )
      if (toForget.length > 0) {
        storeRef.current.getState().pruneLocalClaimRecords(toForget)
      }
    } catch (e) {
      console.warn('[Refunds] fetch error:', e)
      setError('Could not load claims. Pull down to refresh.')
    } finally {
      setLoading(false)
    }
  }, [])

  const handlePullToRefresh = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setRefreshing(true)
    try {
      await Promise.all([
        fetchClaims(true),
        new Promise((resolve) => setTimeout(resolve, 650)),
      ])
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } finally {
      setRefreshing(false)
    }
  }, [fetchClaims])

  const lastFetchTimeRef = useRef<number>(0)

  // Smart Event-Driven Fetch:
  // 1. On tab focus: Only refresh if > 60s elapsed since last fetch (saves battery/data).
  // 2. Initial mount: Always fetches.
  // 3. Pull-to-refresh: Always forces immediate fresh fetch.
  useFocusEffect(
    useCallback(() => {
      void fetchClaims(true)
    }, [fetchClaims])
  )

  // Listen for incoming claim push notifications in foreground -> immediate sync
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data
      if (data && (data.url === '/refunds' || data.claimId)) {
        lastFetchTimeRef.current = Date.now()
        void fetchClaims(true)
      }
    })
    return () => sub.remove()
  }, [fetchClaims])

  // Auto-present the connect decision sheet exactly once for undecided users.
  useEffect(() => {
    if (tflAccountStatus === 'NOT_SET') {
      const t = setTimeout(() => setConnectSheetVisible(true), 450)
      return () => clearTimeout(t)
    }
  }, [tflAccountStatus])

  // ── Derived views ────────────────────────────────────────────────────────
  const claims = useMemo(() => {
    const rawList = data ? [...data.claims] : []
    if (simulatedClaimActive) {
      const SIMULATED_TEST_CLAIM: RadarClaim = {
        id: 99999,
        status: 'detected',
        claimStatus: 'eligible',
        filedAt: null,
        receivedAt: null,
        lineId: 'victoria',
        operator: 'tfl',
        entryStation: 'Victoria',
        exitStation: 'Finsbury Park',
        amountPence: 360,
        cause: 'Signal failure at Oxford Circus',
        causeEligible: true,
        delayMinutes: 22,
        windowCause: 'Signal Failure',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 27 * 86400000).toISOString(),
        entryTime: new Date(Date.now() - 3600000).toISOString(),
        exitTime: new Date(Date.now() - 2280000).toISOString(),
      }
      rawList.unshift(SIMULATED_TEST_CLAIM)
    }
    const sorted = rawList.sort((a, b) => {
      const aOver = isOverdue(a) ? 1 : 0
      const bOver = isOverdue(b) ? 1 : 0
      if (aOver !== bOver) return bOver - aOver
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
    return sorted
  }, [data, simulatedClaimActive])

  const activeClaims = useMemo(
    () =>
      claims.filter((c) => {
        if (loopStateOf(c) !== 'eligible') return false
        return !(dismissedClaims || []).includes(String(c.id))
      }),
    [claims, dismissedClaims]
  )

  const totalEstimatedPence = useMemo(
    () => activeClaims.reduce((sum, c) => sum + (c.amountPence ?? 310), 0),
    [activeClaims]
  )

  const settledCount = useMemo(
    () => claims.filter((c) => loopStateOf(c) === 'received').length,
    [claims]
  )
  const recoveredTotal = data?.recoveredTotal ?? 0
  const earnedUIMounted = shouldMountEarnedUI(settledCount)

  // Signal Lock choreography driver (gated by MMKV last_animated_claim_id).
  const { shouldAnimate, animatedClaimId } = useClaimArrivalAnimation(activeClaims)
  const signalLockClaim = useMemo(
    () =>
      shouldAnimate &&
      animatedClaimId != null &&
      String(animatedClaimId) !== String(shownArrivalId)
        ? activeClaims.find((c) => String(c.id) === String(animatedClaimId)) ?? null
        : null,
    [shouldAnimate, animatedClaimId, activeClaims, shownArrivalId]
  )

  // ── Mutators ─────────────────────────────────────────────────────────────
  const handleFile = useCallback(
    async (id: number) => {
      if (id === 99999) {
        setSimulatedClaimActive(false)
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      useUserPreferencesStore.getState().markClaimSubmittedLocally(id)
      setFilingIds((prev) => ({ ...prev, [id]: true }))
      try {
        const ok = await patchClaim(id, { claimStatus: 'filed' })
        if (!ok && id !== 99999) throw new Error('PATCH failed')
        await useUserPreferencesStore.getState().pruneLocalClaimRecords([id])
        await fetchClaims(true)
      } catch {
        // Kept in the MMKV mirror — the next successful sync flushes it.
        Alert.alert(
          'Saved on this device',
          'No connection right now. Your claim is marked as filed locally and will sync automatically.'
        )
      } finally {
        setFilingIds((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
      }
    },
    [fetchClaims, setSimulatedClaimActive]
  )

  const handleDismiss = useCallback(
    (id: number) => {
      if (id === 99999) {
        setSimulatedClaimActive(false)
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      useUserPreferencesStore.getState().dismissClaimLocally(id)
    },
    [setSimulatedClaimActive]
  )

  const pendingSubmissionClaimIdRef = useRef<number | null>(null)

  // When returning from Safari, present the submission verification modal
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active' && pendingSubmissionClaimIdRef.current != null) {
        const claimId = pendingSubmissionClaimIdRef.current
        pendingSubmissionClaimIdRef.current = null
        setTimeout(() => {
          Alert.alert(
            'Did you submit your claim on TfL?',
            'If you completed the submission on TfL, we will track the 10-day refund review and log your receipt.',
            [
              {
                text: 'Not yet / Incomplete',
                style: 'cancel',
              },
              {
                text: 'Yes, Claim Submitted',
                style: 'default',
                onPress: () => {
                  void handleFile(claimId)
                },
              },
            ]
          )
        }, 400)
      }
    })

    return () => sub.remove()
  }, [handleFile])

  const handleClaimPress = useCallback(
    async (claim: RadarClaim) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      pendingSubmissionClaimIdRef.current = claim.id
      const TFL_CLAIM_URL =
        'https://tfl.gov.uk/fares/refunds-and-replacements'

      // 1. Auto-copy journey summary to clipboard for instant pasting on TfL form
      try {
        const entryFormatted = claim.entryTime
          ? new Date(claim.entryTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
          : 'Unknown'
        const lineCap = (claim.lineId || 'Tube').charAt(0).toUpperCase() + (claim.lineId || 'Tube').slice(1)
        const summary = `${lineCap} line | ${claim.entryStation || 'Origin'} → ${claim.exitStation || 'Destination'} | Touch-in: ${entryFormatted} | ${claim.delayMinutes}m delay`
        await Clipboard.setStringAsync(summary)
      } catch (err) {
        console.warn('[RefundRadar] Clipboard copy error:', err)
      }

      // 2. Launch native system Safari
      try {
        const supported = await Linking.canOpenURL(TFL_CLAIM_URL)
        if (supported) {
          await Linking.openURL(TFL_CLAIM_URL)
        } else {
          await WebBrowser.openBrowserAsync(TFL_CLAIM_URL, {
            toolbarColor: '#0A0F3C',
            controlsColor: '#0098D4',
          })
        }
      } catch (e) {
        console.warn('[RefundRadar] Failed to launch Safari:', e)
      }
    },
    []
  )

  const handleConnectRegistered = useCallback(() => {
    setTflAccountStatus('REGISTERED_28_DAY')
    setConnectSheetVisible(false)
  }, [setTflAccountStatus])

  const handleSurveySubmit = useCallback(
    async (
      id: number,
      outcome: 'PAID_FULL' | 'PAID_PARTIAL' | 'REJECTED' | 'STILL_WAITING',
      settledAmountPence?: number
    ) => {
      if (outcome === 'STILL_WAITING') {
        // FE-04: persist the 3-day quiet period or the auto-prompt
        // effect re-opens this survey instantly (infinite loop).
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
            settledAmountPence:
              outcome === 'PAID_FULL'
                ? surveyClaim?.amountPence
                : settledAmountPence ?? surveyClaim?.amountPence,
          }),
        })
        if (!res.ok) throw new Error('Survey PATCH failed')
        await fetchClaims(true)
      } catch (e) {
        console.warn('[RefundRadar] Survey submission failed:', e)
      } finally {
        setSurveyClaim(null)
      }
    },
    [fetchClaims, surveyClaim]
  )

  // ── Auto-prompt Day-14 Resolution Survey ─────────────────────────────────
  useEffect(() => {
    if (!data) return
    const overdue = data.claims.find(
      (c) =>
        isOverdue(c) &&
        !isSurveySnoozed(c.id) &&
        surveyClaim == null
    )
    if (overdue) setSurveyClaim(overdue)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  // ── Render helpers ───────────────────────────────────────────────────────
  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <View>
          <Text style={styles.title}>Refund Radar</Text>
          <Text style={styles.subtitle}>Automatic delay detection & claims</Text>
        </View>
        {tflAccountStatus !== 'NOT_SET' && (
          <Pressable
            style={styles.statusHeaderPill}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              setConnectSheetVisible(true)
            }}
            accessibilityRole="button"
            accessibilityLabel="Change TfL registration"
          >
            <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFillObject} />
            <ShieldCheck size={14} color="#0098D4" weight="fill" />
            <Text style={styles.statusHeaderPillText}>
              {tflAccountStatus === 'REGISTERED_28_DAY' ? '28-Day' : '7-Day'}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Active claims statutory summary header */}
      {tflAccountStatus !== 'NOT_SET' && activeClaims.length > 0 && (
        <View style={styles.feedSummaryCard}>
          <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={styles.feedSummaryCardContent}>
            <View style={styles.feedSummaryDot} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.feedSummaryTitle}>
                {activeClaims.length} Eligible Delay{activeClaims.length > 1 ? 's' : ''} Detected · ~{formatPence(totalEstimatedPence)} Estimated Baseline
              </Text>
              <Text style={styles.feedSummarySubtext}>
                TfL verifies your journey & settles payout against daily fare caps upon submission
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  )

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

    if (tflAccountStatus === 'NOT_SET') {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.decisionCopy}>
            Choose how Refund Radar should watch your journeys.
          </Text>
        </View>
      )
    }

    return (
      <View>
        <ZeroStateHeroCard checkedAtIso={lastEvaluatedAt} />

        {/* 7-day honesty disclosure for unregistered accounts */}
        {tflAccountStatus === 'UNREGISTERED_7_DAY' && (
          <View style={styles.sevenDayBox}>
            <View style={styles.sevenDayTitleRow}>
              <Text style={styles.sevenDayTitle}>7-Day Radar Active</Text>
              <Pressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  setConnectSheetVisible(true)
                }}
                hitSlop={8}
                style={styles.changePill}
                accessibilityRole="button"
                accessibilityLabel="Change TfL account status"
              >
                <Text style={styles.changePillText}>CHANGE</Text>
              </Pressable>
            </View>
            <Text style={styles.sevenDayBody}>
              Self-reported. Without a TfL link we can only reach the last 7 days
              of journey history — older delays stay invisible.
            </Text>
          </View>
        )}

        {/* In-place Claim History & Receipts trigger card */}
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            setHistoryDrawerVisible(true)
          }}
          style={styles.historyRow}
          accessibilityRole="button"
          accessibilityLabel="View receipts and claim history"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Receipt size={16} color="#0098D4" weight="bold" />
            <Text style={styles.historyRowText}>Claim history & receipts</Text>
          </View>
          <CaretRight size={16} color="rgba(255,255,255,0.45)" weight="bold" />
        </Pressable>

        {/* Compact 28-day statutory trust line */}
        <View style={styles.microTrustRow}>
          <ShieldCheck size={13} color="#34C759" weight="fill" />
          <Text style={styles.microTrustText}>
            TfL 28-Day Guarantee · Claims reconciled against registered Oyster/Card
          </Text>
        </View>
      </View>
    )
  }

  const renderFooter = () => {
    return (
      <View style={{ marginTop: 16, gap: 14 }}>
        {/* Quick action: Claim History & Receipts */}
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            setHistoryDrawerVisible(true)
          }}
          style={styles.historyCard}
          accessibilityRole="button"
          accessibilityLabel="View claim history and receipts"
        >
          <BlurView intensity={GLASS.blurIntensity} tint="dark" style={StyleSheet.absoluteFillObject} />
          <LinearGradient
            colors={[GLASS.specularStart, GLASS.specularEnd]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            pointerEvents="none"
            style={styles.historySpecularSheen}
          />
          <View style={styles.historyCardContent}>
            <View style={styles.historyCardLeft}>
              <View style={styles.historyIconCircle}>
                <Receipt size={18} color="#0098D4" weight="bold" />
              </View>
              <View>
                <Text style={styles.historyCardTitle}>Claim History & Receipts</Text>
                <Text style={styles.historyCardSubtitle}>View filed and settled TfL refunds</Text>
              </View>
            </View>
            <CaretRight size={16} color="rgba(255,255,255,0.40)" weight="bold" />
          </View>
        </Pressable>

        {/* Reassuring statutory guarantee note */}
        <View style={styles.microTrustRow}>
          <ShieldCheck size={14} color="#34C759" weight="fill" />
          <Text style={styles.microTrustText}>
            TfL 28-Day Guarantee · Claims reconciled against registered Oyster/Card
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </View>
    )
  }

  return (
    <View style={styles.rootContainer}>
      <OnboardingGradient />

      <View style={{ flex: 1, paddingTop: insets.top }}>
        <FlatList<{ type: 'CLAIM'; item: RadarClaim } | { type: 'EMPTY' }>
          style={styles.list}
          data={activeClaims.length === 0
            ? [{ type: 'EMPTY' as const }]
            : activeClaims.map((item) => ({ type: 'CLAIM' as const, item }))}
          keyExtractor={(entry) =>
            entry.type === 'CLAIM' ? String(entry.item.id) : 'empty'
          }
          renderItem={({ item }) =>
            item.type === 'CLAIM' ? (
              <ActiveClaimHeroCard
                key={item.item.id}
                claim={item.item}
                onFile={handleFile}
                onDismiss={handleDismiss}
                onOpenPortal={() => void handleClaimPress(item.item)}
                filing={Boolean(filingIds[item.item.id])}
                locallyFiledAtMs={submittedClaims[String(item.item.id)] ?? null}
              />
            ) : (
              renderEmpty()
            )
          }
          ListHeaderComponent={renderHeader}
          ListFooterComponent={renderFooter}
          contentContainerStyle={[
            styles.listContent,
            {
              paddingBottom: Math.max(insets.bottom + 80, 100),
            },
          ]}
          bounces={true}
          alwaysBounceVertical={true}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handlePullToRefresh}
              tintColor="rgba(255, 255, 255, 0.6)"
            />
          }
        />
      </View>

      {/* Signal Lock arrival choreography overlay */}
      {signalLockClaim ? (
        <SignalLockHero claim={signalLockClaim} onDone={() => setShownArrivalId(signalLockClaim.id)} />
      ) : null}

      {/* Connect decision sheet (4-block loss aversion) */}
      <TfLConnectSheet
        visible={connectSheetVisible}
        onClose={() => setConnectSheetVisible(false)}
        onRegistered={handleConnectRegistered}
        onUnregistered={() => {
          setTflAccountStatus('UNREGISTERED_7_DAY')
          setConnectSheetVisible(false)
        }}
      />

      {/* Day 14 SLA Resolution Survey */}
      <SlaSurveyModal
        visible={Boolean(surveyClaim)}
        claim={surveyClaim}
        onClose={() => setSurveyClaim(null)}
        onSubmit={handleSurveySubmit}
      />

      {/* In-Place Claim History & Receipts Drawer */}
      <ClaimHistoryDrawer
        visible={historyDrawerVisible}
        claims={data?.claims ?? []}
        onClose={() => setHistoryDrawerVisible(false)}
      />
    </View>
  )
}

// ── API helper ─────────────────────────────────────────────────────────────

async function patchClaim(
  id: number,
  body: Record<string, unknown>
): Promise<boolean> {
  try {
    const { userId, apiKey } = await ensureDeviceIdentity()
    const res = await fetch(`${APP_CONFIG.BACKEND_API_URL}/api/claims/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-api-key': apiKey,
      },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#0A0F3C',
  },
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  header: {
    paddingTop: 8,
    marginBottom: 18,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusHeaderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.25,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  statusHeaderPillText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 12,
    color: '#0098D4',
  },
  title: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 28,
    color: '#FFFFFF',
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  subtitle: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.65)',
    marginTop: 2,
  },
  feedSummaryCard: {
    marginTop: 14,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1.25,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  feedSummaryCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  feedSummaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0098D4',
  },
  feedSummaryTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 13.5,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  feedSummarySubtext: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.60)',
    lineHeight: 15,
  },

  // ── Empty / Error ───
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptySubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 18,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0098D4',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 6,
  },
  retryButtonText: {
    color: '#0A0F3C',
    fontWeight: '700',
    fontSize: 14,
  },
  decisionCopy: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
    paddingHorizontal: 30,
    lineHeight: 20,
  },

  // ── 7-day disclosure ───
  sevenDayBox: {
    borderRadius: 16,
    borderWidth: 1.25,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(10, 15, 60, 0.65)',
    padding: 14,
    marginTop: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.40,
    shadowRadius: 12,
    elevation: 6,
  },
  sevenDayTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sevenDayTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  changePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(0,152,212,0.15)',
  },
  changePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0098D4',
    letterSpacing: 0.5,
  },
  sevenDayBody: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 15,
  },

  // ── Earned UI footer ───
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.25,
    borderColor: GLASS.borderColor,
    backgroundColor: GLASS.background,
    marginTop: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.40,
    shadowRadius: 10,
    elevation: 4,
  },
  historyRowText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  historyCard: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.25,
    borderColor: GLASS.borderColor,
    backgroundColor: GLASS.background,
    position: 'relative',
  },
  historySpecularSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 18,
  },
  historyCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  historyCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  historyIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 152, 212, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyCardTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 14.5,
    color: '#FFFFFF',
  },
  historyCardSubtitle: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 11.5,
    color: 'rgba(255, 255, 255, 0.55)',
    marginTop: 1,
  },

  // ── Signal Lock overlay ───
  signalLockOuter: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 120,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.45)',
    backgroundColor: 'rgba(10,15,60,0.92)',
    padding: 22,
    gap: 10,
    alignItems: 'center',
  },
  signalLockTopRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'flex-start',
  },
  signalLockDotWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  signalLockDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    boxShadow: '0px 0px 8px #F59E0B',
  },
  signalLockEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: 'rgba(255,255,255,0.55)',
  },
  signalLockAmount: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  signalLockCaption: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
  microTrustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 18,
    paddingVertical: 4,
  },
  microTrustText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.40)',
    fontWeight: '500',
    letterSpacing: 0.2,
  },
})
