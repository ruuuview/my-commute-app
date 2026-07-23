// app/(tabs)/refunds.tsx
// Refund Radar — claims history with frosted glassmorphism (per AGENTS.md).

import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BlurView } from 'expo-blur'
import { Ionicons } from '@expo/vector-icons'
import { useUserPreferencesStore } from '../../store/userPreferencesStore'
import { APP_CONFIG } from '../../config/app.config'

// ── Types ───────────────────────────────────────────────────────────

interface Claim {
  id: number
  status: string
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
  count: number
}

// ── Status display config ───────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  detected:    { label: 'Under Review',  icon: 'time-outline',         color: '#FFB800' },
  ineligible:  { label: 'Not Eligible',  icon: 'close-circle-outline', color: 'rgba(255,255,255,0.35)' },
  submitted:   { label: 'Submitted',     icon: 'send-outline',         color: '#4A9EFF' },
  paid:        { label: 'Paid',           icon: 'checkmark-circle',     color: '#34C759' },
  expired:     { label: 'Expired',       icon: 'alert-circle-outline', color: 'rgba(255,255,255,0.2)' },
}

// ── Claim Card ──────────────────────────────────────────────────────

const ClaimCard = React.memo(({ claim }: { claim: Claim }) => {
  const cfg = STATUS_CONFIG[claim.status] ?? { label: claim.status, icon: 'help-outline', color: '#888' }

  const dateStr = claim.entryTime
    ? new Date(claim.entryTime).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : new Date(claim.createdAt).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short',
      })

  return (
    <View style={styles.cardOuter}>
      <BlurView intensity={40} tint="dark" style={styles.cardBlur}>
        {/* Top row: status badge + amount */}
        <View style={styles.cardHeader}>
          <View style={[styles.statusBadge, { borderColor: cfg.color }]}>
            <Ionicons name={cfg.icon as any} size={14} color={cfg.color} />
            <Text style={[styles.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          <Text style={styles.amountText}>
            {(claim.amountPence / 100).toLocaleString('en-GB', {
              style: 'currency',
              currency: 'GBP',
              minimumFractionDigits: 2,
            })}
          </Text>
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
      </BlurView>
    </View>
  )
})
ClaimCard.displayName = 'ClaimCard'

// ── Main Screen ─────────────────────────────────────────────────────

export default function RefundsScreen() {
  const insets = useSafeAreaInsets()
  const [data, setData] = useState<ClaimsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const userId = useUserPreferencesStore(s => s.userId)
  const apiKey = useUserPreferencesStore(s => s.apiKey)

  const fetchClaims = useCallback(async (isRefresh = false) => {
    if (!userId || !apiKey) {
      setLoading(false)
      return
    }
    if (!isRefresh) setLoading(true)
    try {
      const res = await fetch(`${APP_CONFIG.BACKEND_URL}/api/claims`, {
        headers: { 'x-user-id': userId, 'x-api-key': apiKey },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: ClaimsResponse = await res.json()
      setData(json)
    } catch (e) {
      console.warn('[Refunds] fetch error:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [userId, apiKey])

  useEffect(() => { fetchClaims() }, [fetchClaims])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchClaims(true)
  }, [fetchClaims])

  // ── Empty state ───────────────────────────────────────────────────
  if (!loading && (!data || data.claims.length === 0)) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <GradientBackground />
        <View style={styles.header}>
          <Text style={styles.title}>Refund Radar</Text>
        </View>
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="radar-outline" size={64} color="rgba(255,255,255,0.1)" />
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
        <GradientBackground />
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
    ? (data.pendingTotal / 100).toLocaleString('en-GB', {
        style: 'currency',
        currency: 'GBP',
        minimumFractionDigits: 2,
      })
    : '£0.00'

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <GradientBackground />
      <View style={styles.header}>
        <Text style={styles.title}>Refund Radar</Text>
        <Text style={styles.subtitle}>Auto-detected delay claims</Text>
      </View>

      {/* Total pending banner */}
      {data && data.pendingTotal > 0 && (
        <View style={styles.pendingBannerOuter}>
          <BlurView intensity={45} tint="dark" style={styles.pendingBanner}>
            <Text style={styles.pendingLabel}>Pending refunds</Text>
            <Text style={styles.pendingAmount}>{pendingFormatted}</Text>
          </BlurView>
        </View>
      )}

      <FlatList
        data={data?.claims ?? []}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => <ClaimCard claim={item} />}
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

  // Pending banner
  pendingBannerOuter: {
    paddingHorizontal: 20,
    marginBottom: 16,
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
    lineHeight: 22,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 100,
  },
})
