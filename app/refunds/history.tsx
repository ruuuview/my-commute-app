// app/refunds/history.tsx
// Receipts & audit trail — Radar v2 State C deep-dive.
// Filter pills (All / Settled / In Review / Expired / Rejected) over the full
// claim history + Day-14 SLA survey cards for overdue filed claims.

import React, { useState, useCallback, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, useRouter } from 'expo-router'
import { BlurView } from 'expo-blur'
import * as Haptics from 'expo-haptics'
import {
  ArrowLeft,
  ArrowsClockwise,
  WarningCircle,
  CheckCircle,
  Clock,
  XCircle,
  Receipt,
} from 'phosphor-react-native'
import { APP_CONFIG } from '../../config/app.config'
import { ensureDeviceIdentity } from '../../services/deviceIdentity'
import {
  formatPence,
  isOverdue,
  isSurveySnoozed,
  snoozeSurvey,
} from '../../services/refundSlaService'
import { useUserPreferencesStore } from '../../store/userPreferencesStore'
import { OnboardingGradient } from '../../components/OnboardingGradient'
import { SlaSurveyModal } from '../../components/refunds/SlaSurveyModal'
import { GLASS } from '../../theme/colors'
import {
  loopStateOf,
  daysLeftUntil,
  type ClaimsResponse,
  type RadarClaim,
} from '../../components/refunds/types'

type FilterKey = 'ALL' | 'SETTLED' | 'IN_REVIEW' | 'EXPIRED' | 'REJECTED'

const FILTER_PILLS: { key: FilterKey; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'SETTLED', label: 'Settled' },
  { key: 'IN_REVIEW', label: 'In Review' },
  { key: 'EXPIRED', label: 'Expired' },
  { key: 'REJECTED', label: 'Rejected' },
]

function claimMatchesFilter(claim: RadarClaim, filter: FilterKey): boolean {
  const state = loopStateOf(claim)
  switch (filter) {
    case 'ALL':
      return true
    case 'SETTLED':
      return state === 'received'
    case 'IN_REVIEW':
      return state === 'filed' && !isOverdue(claim)
    case 'EXPIRED':
      return (
        state === 'closed' ||
        (state === 'eligible' && daysLeftUntil(claim.expiresAt) === 0)
      )
    case 'REJECTED':
      return claim.latestOutcome?.outcomeStatus === 'REJECTED'
    default:
      return false
  }
}

const ReceiptCard = React.memo(({ claim }: { claim: RadarClaim }) => {
  const state = loopStateOf(claim)
  const outcome = claim.latestOutcome

  const iconColor =
    state === 'received'
      ? '#34C759'
      : state === 'filed'
        ? '#0098D4'
        : state === 'eligible'
          ? '#F59E0B'
          : 'rgba(255,255,255,0.35)'
  const Icon =
    state === 'received'
      ? CheckCircle
      : state === 'filed'
        ? Clock
        : state === 'eligible'
          ? WarningCircle
          : XCircle

  const dateStr = new Date(claim.createdAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  const amountLabel =
    state === 'received' && outcome?.settledAmountPence != null
      ? formatPence(outcome.settledAmountPence)
      : formatPence(claim.amountPence)

  const statusLabel =
    state === 'received'
      ? outcome?.outcomeStatus === 'APPROVED_PARTIAL'
        ? 'Settled — partial payout'
        : 'Settled'
      : state === 'filed'
        ? isOverdue(claim)
          ? `In review — past ${10} working days`
          : 'In review with TfL'
        : state === 'eligible'
          ? `Eligible · ${daysLeftUntil(claim.expiresAt)}d left to file`
          : state === 'unverified'
            ? 'Unverified notice'
            : state === 'ineligible'
              ? 'Not eligible (statutory)'
              : 'Closed'

  return (
    <View style={styles.cardOuter}>
      <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFillObject} />
      <View style={styles.cardFill}>
        <View style={styles.cardHeader}>
          <Icon size={18} color={iconColor} weight="bold" />
          <Text style={styles.stationText} numberOfLines={1}>
            {claim.entryStation ?? 'Origin'} → {claim.exitStation ?? 'Destination'}
          </Text>
          <Text style={styles.amountText}>{amountLabel}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={[styles.statusText, { color: iconColor }]}>{statusLabel}</Text>
          <Text style={styles.dateText}>{dateStr}</Text>
        </View>
      </View>
    </View>
  )
})
ReceiptCard.displayName = 'ReceiptCard'

export default function RefundsHistoryScreen() {
  const router = useRouter()
  const tflRegistered = useUserPreferencesStore((s) => s.tflRegistered)

  const [data, setData] = useState<ClaimsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterKey>('ALL')
  const [surveyClaim, setSurveyClaim] = useState<RadarClaim | null>(null)

  const fetchClaims = useCallback(async (isRefresh = false) => {
    try {
      setError(null)
      if (!isRefresh) setLoading(true)
      const { userId, apiKey } = await ensureDeviceIdentity()
      const res = await fetch(`${APP_CONFIG.BACKEND_API_URL}/api/claims`, {
        headers: { 'x-user-id': userId, 'x-api-key': apiKey },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: ClaimsResponse = await res.json()
      setData(json)
    } catch (e) {
      console.warn('[RefundsHistory] fetch error:', e)
      setError('Could not load claim history. Pull down to refresh.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void fetchClaims()
  }, [fetchClaims])

  // Day-14 SLA survey: auto-open for overdue filed claims not snoozed.
  useEffect(() => {
    if (!data) return
    const overdue = data.claims.find(
      (c) => isOverdue(c) && !isSurveySnoozed(c.id)
    )
    if (overdue) setSurveyClaim(overdue)
  }, [data])

  const handleSurveySubmit = useCallback(
    async (
      id: number,
      outcome:
        | 'PAID_FULL'
        | 'PAID_PARTIAL'
        | 'REJECTED'
        | 'STILL_WAITING',
      settledAmountPence?: number
    ) => {
      if (outcome === 'STILL_WAITING') {
        snoozeSurvey(id)
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
        console.warn('[RefundsHistory] survey submit error:', e)
      }
    },
    [fetchClaims]
  )

  const filteredClaims = (data?.claims ?? []).filter((c) =>
    claimMatchesFilter(c, filter)
  )
  const settledCount = (data?.claims ?? []).filter(
    (c) => loopStateOf(c) === 'received'
  ).length
  const recoveredTotal = data?.recoveredTotal ?? 0

  return (
    <View style={styles.root}>
      <OnboardingGradient />
      <Stack.Screen
        options={{ headerShown: false, title: 'Refunds History' }}
      />
      <SafeAreaView style={styles.flex1} edges={['top']}>
        {/* Header */}
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              router.back()
            }}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back to Refund Radar"
          >
            <ArrowLeft size={16} color="#FFFFFF" weight="bold" />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Receipts</Text>
            <Text style={styles.headerSubtitle}>
              {formatPence(recoveredTotal)} recovered · {settledCount}{' '}
              settled claim{settledCount === 1 ? '' : 's'}
            </Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        {/* Filter pills */}
        <View style={styles.pillRow}>
          {FILTER_PILLS.map((pill) => {
            const active = filter === pill.key
            return (
              <Pressable
                key={pill.key}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  setFilter(pill.key)
                }}
                style={[styles.pill, active && styles.pillActive]}
                accessibilityRole="button"
                accessibilityLabel={`Filter ${pill.label}`}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>
                  {pill.label}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color="rgba(255,255,255,0.5)" />
          </View>
        ) : error && !data ? (
          <View style={styles.centerBox}>
            <WarningCircle size={44} color="#FFB800" weight="duotone" />
            <Text style={styles.emptyTitle}>Unable to Load History</Text>
            <Text style={styles.emptySubtitle}>{error}</Text>
            <Pressable
              style={styles.retryButton}
              onPress={() => {
                setRefreshing(true)
                void fetchClaims(true)
              }}
              accessibilityRole="button"
              accessibilityLabel="Try again"
            >
              <ArrowsClockwise size={15} color="#FFFFFF" weight="bold" />
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : filteredClaims.length === 0 ? (
          <View style={styles.centerBox}>
            <Receipt size={44} color="rgba(255,255,255,0.3)" weight="duotone" />
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptySubtitle}>
              No claims match this filter.
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredClaims}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => <ReceiptCard claim={item} />}
            contentContainerStyle={styles.listContent}
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
        )}
      </SafeAreaView>

      <SlaSurveyModal
        visible={Boolean(surveyClaim)}
        claim={surveyClaim}
        onClose={() => setSurveyClaim(null)}
        onSubmit={handleSurveySubmit}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0F3C',
  },
  flex1: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  pillActive: {
    backgroundColor: 'rgba(0,152,212,0.25)',
    borderColor: '#0098D4',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.65)',
  },
  pillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 10,
  },
  cardOuter: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderTopWidth: 1.25,
    borderTopColor: GLASS.borderTop,
    borderBottomColor: GLASS.borderBottom,
    borderLeftColor: GLASS.borderSides,
    borderRightColor: GLASS.borderSides,
    shadowColor: GLASS.shadowColor,
    shadowOffset: GLASS.shadowOffset,
    shadowOpacity: GLASS.shadowOpacity,
    shadowRadius: GLASS.shadowRadius,
    elevation: 6,
  },
  cardFill: {
    padding: 14,
    backgroundColor: 'rgba(18, 26, 43, 0.75)',
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stationText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  amountText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    marginLeft: 'auto',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dateText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptySubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    paddingHorizontal: 30,
    lineHeight: 18,
  },
  retryButton: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,152,212,0.9)',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
  },
  retryText: {
    color: '#0A0F3C',
    fontWeight: '700',
    fontSize: 14,
  },
})
