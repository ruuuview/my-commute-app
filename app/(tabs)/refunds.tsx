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
  Linking,
  Image,
  Alert,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import * as WebBrowser from 'expo-web-browser'
import * as Haptics from 'expo-haptics'
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
} from 'phosphor-react-native'
import { useRouter } from 'expo-router'
import { APP_CONFIG } from '../../config/app.config'
import { ensureDeviceIdentity } from '../../services/deviceIdentity'
import {
  isOverdue,
  formatPence,
  snoozeSurvey,
} from '../../services/refundSlaService'
import { useUserPreferencesStore } from '../../store/userPreferencesStore'
import { OnboardingGradient } from '../../components/OnboardingGradient'
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
import SafariClaimAssistant from '../../components/refunds/SafariClaimAssistant'
import MonitoredCorridorsRow from '../../components/refunds/MonitoredCorridorsRow'
import LifetimeMetricsCard from '../../components/refunds/LifetimeMetricsCard'
import { SlaSurveyModal } from '../../components/refunds/SlaSurveyModal'
import {
  loopStateOf,
  shouldMountEarnedUI,
  type ClaimsResponse,
  type RadarClaim,
} from '../../components/refunds/types'

const TFL_CONTACTLESS_PORTAL_URL =
  'https://tfl.gov.uk/fares/contactless-and-oyster-account'

// Safari hand-off delay: the assistant modal must fully unmount BEFORE the
// OS browser presentation begins (Test C: "modal closes completely").
const SAFARI_HANDOFF_DELAY_MS = 380

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
  const storeRef = useRef(useUserPreferencesStore)

  const [data, setData] = useState<ClaimsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connectSheetVisible, setConnectSheetVisible] = useState(false)
  const [assistantClaim, setAssistantClaim] = useState<RadarClaim | null>(null)
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
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void fetchClaims()
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
    if (!data) return []
    const sorted = [...data.claims].sort((a, b) => {
      const aOver = isOverdue(a) ? 1 : 0
      const bOver = isOverdue(b) ? 1 : 0
      if (aOver !== bOver) return bOver - aOver
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
    return sorted
  }, [data])

  const activeClaims = useMemo(
    () =>
      claims.filter((c) => {
        if (loopStateOf(c) !== 'eligible') return false
        return !(dismissedClaims || []).includes(String(c.id))
      }),
    [claims, dismissedClaims]
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

  // ── Mutations ────────────────────────────────────────────────────────────
  const handleFile = useCallback(async (id: number) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    // Optimistic local record FIRST (offline-safe queue per master plan §5).
    useUserPreferencesStore.getState().markClaimSubmittedLocally(id)
    setFilingIds((prev) => ({ ...prev, [id]: true }))
    try {
      const ok = await patchClaim(id, { claimStatus: 'filed' })
      if (!ok) throw new Error('PATCH failed')
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
  }, [fetchClaims])

  const handleDismiss = useCallback((id: number) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    useUserPreferencesStore.getState().dismissClaimLocally(id)
  }, [])

  const handleLaunchPortal = useCallback(async (claim: RadarClaim) => {
    setAssistantClaim(null) // modal must close completely BEFORE Safari opens
    const parts = [
      claim.entryTime
        ? new Date(claim.entryTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : '',
      claim.entryTime
        ? new Date(claim.entryTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        : '',
      claim.entryStation ?? '',
      claim.exitStation ?? '',
    ].filter(Boolean)
    await Clipboard.setStringAsync(parts.join(' · ')).catch(() => {})
    setTimeout(() => {
      void WebBrowser.openBrowserAsync(TFL_CONTACTLESS_PORTAL_URL).catch(() => {
        void Linking.openURL(TFL_CONTACTLESS_PORTAL_URL).catch(() => {})
      })
    }, SAFARI_HANDOFF_DELAY_MS)
  }, [])

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
            settledAmountPence: settledAmountPence ?? 0,
          }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        await fetchClaims(true)
      } catch (e) {
        console.warn('[Refunds] SLA survey submit error:', e)
        Alert.alert('Error', 'Could not save feedback. Please try again.')
      }
    },
    [fetchClaims]
  )

  // Day-14 survey auto-prompt for overdue filed claims.
  useEffect(() => {
    if (!data || data.claims.length === 0) return
    const overdue = claims.find(
      (c) =>
        loopStateOf(c) === 'filed' &&
        isOverdue(c) &&
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
            <ShieldCheck size={14} color="#0098D4" weight="fill" />
            <Text style={styles.statusHeaderPillText}>
              {tflAccountStatus === 'REGISTERED_28_DAY' ? '28-Day' : '7-Day'}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Corridor chips — always visible once Radar is configured */}
      {tflAccountStatus !== 'NOT_SET' && (
        <View style={{ marginTop: 14 }}>
          <MonitoredCorridorsRow lineIds={selectedLines} />
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
      </View>
    )
  }

  const renderFooter = () => {
    if (tflAccountStatus !== 'REGISTERED_28_DAY') return <View style={{ height: 40 }} />

    return (
      <View>
        {/* Earned UI — mounts ONLY when money has actually been recovered */}
        {earnedUIMounted && (
          <View style={{ marginTop: 20 }}>
            <LifetimeMetricsCard
              recoveredTotalPence={recoveredTotal}
              settledCount={settledCount}
            />
            <Pressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                router.push('/refunds/history')
              }}
              style={styles.historyRow}
              accessibilityRole="button"
              accessibilityLabel="View receipts and claim history"
            >
              <Text style={styles.historyRowText}>Receipts & claim history</Text>
              <CaretRight size={16} color="rgba(255,255,255,0.45)" weight="bold" />
            </Pressable>
          </View>
        )}
        <View style={{ height: 40 }} />
      </View>
    )
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
        data={
          tflAccountStatus === 'NOT_SET' || signalLockClaim
            ? []
            : activeClaims
        }
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item, index }) => (
          <ActiveClaimHeroCard
            claim={item}
            index={index}
            total={activeClaims.length}
            onPrev={() => undefined}
            onNext={() => undefined}
            onFile={handleFile}
            onDismiss={handleDismiss}
            onOpenPortal={() => setAssistantClaim(item)}
            filing={Boolean(filingIds[item.id])}
            locallyFiledAtMs={submittedClaims[String(item.id)] ?? null}
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
            onRefresh={() => {
              setRefreshing(true)
              void fetchClaims(true)
            }}
            tintColor="#0098D4"
            colors={['#0098D4']}
          />
        }
      />

      {/* Signal Lock arrival choreography overlay */}
      {signalLockClaim ? (
        <SignalLockHero claim={signalLockClaim} onDone={() => setShownArrivalId(signalLockClaim.id)} />
      ) : null}

      {/* Connect decision sheet (4-block loss aversion) */}
      <TfLConnectSheet
        visible={connectSheetVisible}
        onClose={() => setConnectSheetVisible(false)}
        onRegistered={() => {
          setTflAccountStatus('REGISTERED_28_DAY')
          setConnectSheetVisible(false)
        }}
        onUnregistered={() => {
          setTflAccountStatus('UNREGISTERED_7_DAY')
          setConnectSheetVisible(false)
        }}
      />

      {/* Safari claim assistant (copy chips → portal hand-off) */}
      {assistantClaim ? (
        <SafariClaimAssistant
          visible
          claim={assistantClaim}
          onClose={() => setAssistantClaim(null)}
          onLaunch={(claim) => void handleLaunchPortal(claim)}
        />
      ) : null}

      {/* Day 14 SLA Resolution Survey */}
      <SlaSurveyModal
        visible={Boolean(surveyClaim)}
        claim={surveyClaim}
        onClose={() => setSurveyClaim(null)}
        onSubmit={handleSurveySubmit}
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
  listContent: {
    paddingHorizontal: 20,
  },
  header: {
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
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 152, 212, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0, 152, 212, 0.35)',
  },
  statusHeaderPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0098D4',
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(18,26,43,0.75)',
    padding: 14,
    marginTop: 4,
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginTop: 12,
  },
  historyRowText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
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
})
