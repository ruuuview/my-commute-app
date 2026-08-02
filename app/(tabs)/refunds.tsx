// app/(tabs)/refunds.tsx
// Refund Radar — claims history with frosted glassmorphism (per AGENTS.md).
//
// The "Did you get it?" loop (v10 spec):
//   Eligible (app-detected) → Filed (user taps "I filed my claim") →
//   Received (user taps "Money received").
//   filed/received are self-reported — the app cannot see TfL's side. Two
//   buttons, not one: a single button would leave "received" permanently
//   unknown and the loop never closes.

import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Clipboard,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BlurView } from 'expo-blur'
import { Ionicons } from '@expo/vector-icons'
import { APP_CONFIG } from '../../config/app.config'
import { launchTflAuth } from '../../services/authSession'
import { ensureDeviceIdentity } from '../../services/deviceIdentity'
import { DEMO_MODE } from '../../config/demoMode'
import { useRouter } from 'expo-router'

// ── Types ───────────────────────────────────────────────────────────

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

// ── Status display config ───────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  eligible:   { label: 'Eligible — file on TfL', icon: 'alert-circle-outline', color: '#FFB800' },
  filed:      { label: 'Filed — awaiting payment', icon: 'send-outline',         color: '#4A9EFF' },
  received:   { label: 'Received',                icon: 'checkmark-circle',      color: '#34C759' },
  ineligible: { label: 'Not Eligible',            icon: 'close-circle-outline',  color: 'rgba(255,255,255,0.35)' },
  expired:    { label: 'Expired',                 icon: 'alert-circle-outline',  color: 'rgba(255,255,255,0.2)' },
}

// Loop state derived from the claim: eligible = detected/notified without a
// claimStatus; filed/received come straight from claimStatus.
function loopState(claim: Claim): 'eligible' | 'filed' | 'received' | 'closed' {
  if (claim.claimStatus) return claim.claimStatus
  if (claim.status === 'detected' || claim.status === 'notified') return 'eligible'
  return 'closed'
}

// filedAt + 10 working days (skip Sat/Sun) — mirrors the backend's nudge
// schedule so the in-app badge matches the push.
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
  const due = addWorkingDays(new Date(claim.filedAt), 10)
  return new Date() > due
}

function formatPence(pence: number): string {
  return (pence / 100).toLocaleString('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
  })
}

// ── Claim Card ──────────────────────────────────────────────────────

const ClaimCard = React.memo(({ claim, onUpdate, updating }: {
  claim: Claim
  onUpdate: (id: number, next: 'filed' | 'received') => void
  updating?: 'filed' | 'received'
}) => {
  const state = loopState(claim)
  const cfg = STATUS_CONFIG[state] ?? { label: state, icon: 'help-outline', color: '#888' }
  const overdue = isOverdue(claim)

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
            <Ionicons name={cfg.icon as any} size={14} color={cfg.color} />
            <Text style={[styles.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          <Text style={styles.amountText}>{formatPence(claim.amountPence)}</Text>
        </View>

        {/* Journey details */}
        <View style={styles.journeyRow}>
          <Ionicons name="subway-outline" size={14} color="rgba(255,255,255,0.4)" />
          <Text style={styles.journeyLine}>
            {claim.lineId.charAt(0).toUpperCase() + claim.lineId.slice(1)}
          </Text>
        </View>

        <View style={styles.stationRow}>
          <Text style={styles.stationText} numberOfLines={1}>
            {claim.entryStation ?? 'Unknown'}
          </Text>
          <Ionicons name="arrow-forward" size={14} color="rgba(255,255,255,0.3)" />
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

        {/* Loop actions — only for claims still in the game */}
        {state === 'eligible' && (
          <>
            <Pressable
              onPress={() => {
                const evidence = JSON.stringify({
                  date: dateStr,
                  line: claim.lineId,
                  delay: `${claim.delayMinutes}min`,
                  entry: claim.entryStation,
                  exit: claim.exitStation,
                  amount: formatPence(claim.amountPence),
                }, null, 2)
                Clipboard.setString(evidence)
                launchTflAuth('refund_radar')
              }}
              style={({ pressed }) => [
                styles.fileClaimButton,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={styles.fileClaimButtonText}>File Claim on TfL</Text>
            </Pressable>

            <Pressable
              onPress={() => onUpdate(claim.id, 'filed')}
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
                  <Ionicons name="send-outline" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.loopButtonText}>I filed my claim</Text>
                </>
              )}
            </Pressable>
          </>
        )}

        {state === 'filed' && (
          <>
            {overdue && (
              <View style={styles.overdueBanner}>
                <Ionicons name="notifications-outline" size={14} color="#FFB800" style={{ marginRight: 6 }} />
                <Text style={styles.overdueText}>
                  Filed {workingDaysSince(claim.filedAt!)} working days ago. Landed yet?
                </Text>
              </View>
            )}
            <Pressable
              onPress={() => onUpdate(claim.id, 'received')}
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
                  <Ionicons name="checkmark-circle-outline" size={15} color="#34C759" style={{ marginRight: 6 }} />
                  <Text style={[styles.loopButtonText, { color: '#34C759' }]}>Money received</Text>
                </>
              )}
            </Pressable>
          </>
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

// ── Main Screen ─────────────────────────────────────────────────────

export default function RefundsScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [data, setData] = useState<ClaimsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState<Record<number, 'filed' | 'received'>>({})

  // Phase 7 #14: demo builds must never surface Refund Radar — even via
  // a deep link.
  useEffect(() => {
    if (DEMO_MODE) {
      router.replace('/(tabs)')
    }
  }, [router])

  const fetchClaims = useCallback(async (isRefresh = false) => {
    try {
      setError(null)
      // Bug #3 fix: keys are guaranteed to exist (created at onboarding
      // finish); lazy ensure self-heals older installs.
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

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchClaims(true)
  }, [fetchClaims])

  // Optimistic loop update: PATCH the server, then re-fetch so the
  // server-computed recoveredTotal stays the source of truth.
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

  // ── Error state ────────────────────────────────────────────────────
  if (!loading && error && !data) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Refund Radar</Text>
        </View>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="rgba(255,255,255,0.4)"
            />
          }
        >
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="alert-circle-outline" size={64} color="rgba(255,184,0,0.4)" />
            </View>
            <Text style={styles.emptyTitle}>Unable to Load Claims</Text>
            <Text style={styles.emptySubtitle}>{error}</Text>
            <Pressable
              style={styles.retryButton}
              onPress={() => fetchClaims(true)}
              accessibilityRole="button"
              accessibilityLabel="Try again"
            >
              <Ionicons name="refresh-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.retryButtonText}>Try again</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    )
  }

  // ── Empty state ───────────────────────────────────────────────────
  if (!loading && (!data || data.claims.length === 0)) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Refund Radar</Text>
        </View>
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="cash-outline" size={64} color="rgba(255,255,255,0.1)" />
          </View>
          <Text style={styles.emptyTitle}>No Claims Yet</Text>
          <Text style={styles.emptySubtitle}>
            Delays will be automatically detected{'\n'}and refunds calculated after each journey
          </Text>
        </View>
      </View>
    )
  }

  // ── Loading state ─────────────────────────────────────────────────
  if (loading && !data) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Refund Radar</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="rgba(255,255,255,0.4)" />
        </View>
      </View>
    )
  }

  // ── Claims list ───────────────────────────────────────────────────
  const pendingFormatted = data
    ? formatPence(data.pendingTotal)
    : '£0.00'
  const recoveredFormatted = data && data.recoveredTotal > 0
    ? formatPence(data.recoveredTotal)
    : null

  const badgeCount = data
    ? data.claims.filter(c => c.claimStatus === 'filed' && isOverdue(c)).length
    : 0

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Refund Radar</Text>
        <Text style={styles.subtitle}>Auto-detected delay claims</Text>
      </View>

      {/* Recovered-so-far banner (the pitch stat) */}
      {recoveredFormatted && (
        <View style={styles.pendingBannerOuter}>
          <BlurView intensity={45} tint="dark" style={styles.recoveredBanner}>
            <View>
              <Text style={styles.pendingLabel}>Recovered so far</Text>
              <Text style={styles.recoveredCaption}>Money you've told us landed</Text>
            </View>
            <Text style={styles.recoveredAmount}>{recoveredFormatted}</Text>
          </BlurView>
        </View>
      )}

      {/* Pending refunds banner */}
      {data && data.pendingTotal > 0 && (
        <View style={styles.pendingBannerOuter}>
          <BlurView intensity={45} tint="dark" style={styles.pendingBanner}>
            <Text style={styles.pendingLabel}>Pending refunds</Text>
            <Text style={styles.pendingAmount}>{pendingFormatted}</Text>
          </BlurView>
        </View>
      )}

      {/* In-app passive badge — covers notif-denied users */}
      {badgeCount > 0 && (
        <View style={styles.badgeRow}>
          <View style={styles.badgeDot} />
          <Text style={styles.badgeText}>
            {badgeCount} filed {badgeCount === 1 ? 'claim is' : 'claims are'} past 10 working days — did the money land?
          </Text>
        </View>
      )}

      <FlatList
        data={data?.claims ?? []}
        keyExtractor={item => String(item.id)}
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

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 34,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 15,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },

  // Banners
  pendingBannerOuter: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  pendingBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 20,
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
    paddingVertical: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(52,199,89,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(52,199,89,0.35)',
    overflow: 'hidden',
  },
  pendingLabel: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
  },
  pendingAmount: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 24,
    color: '#34C759',
    letterSpacing: -0.3,
  },
  recoveredAmount: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 24,
    color: '#34C759',
    letterSpacing: -0.3,
  },
  recoveredCaption: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(52,199,89,0.6)',
    marginTop: 2,
  },

  // Badge row (passive in-app layer)
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

  // Card
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

  // Journey details
  journeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  journeyLine: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
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
    color: 'rgba(255,255,255,0.8)',
    flex: 1,
  },

  // Meta bottom
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
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

  // List
  listContent: {
    paddingBottom: 120,
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 100,
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 20,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 15,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    paddingHorizontal: 32,
    marginBottom: 20,
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
  },
  retryButtonText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 14,
    color: '#FFFFFF',
  },

  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 100,
  },
  fileClaimButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.30)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 12,
  },
  fileClaimButtonText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.80)',
  },

  // Loop buttons
  loopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(74,158,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(74,158,255,0.45)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 8,
  },
  receivedButton: {
    backgroundColor: 'rgba(52,199,89,0.12)',
    borderColor: 'rgba(52,199,89,0.40)',
  },
  loopButtonText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 13,
    color: '#FFFFFF',
  },

  // Overdue surface
  overdueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
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
})
