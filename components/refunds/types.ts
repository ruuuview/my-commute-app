// components/refunds/types.ts
// Single-source claim contract for the Radar v2 terminal.
// Mirrors the row shape returned by backend GET /api/claims (verified against
// backend/app/api/claims/route.ts). Every Refund Radar v2 component imports
// THIS type — never re-declare a local claim interface.

export interface RadarClaim {
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

export interface ClaimsResponse {
  claims: RadarClaim[]
  pendingTotal: number
  recoveredTotal: number
  count: number
  evaluatedAt?: string
}

/** Derives the client-side loop state from server fields (single authority). */
export type RadarLoopState =
  | 'eligible'
  | 'filed'
  | 'received'
  | 'unverified'
  | 'ineligible'
  | 'closed'

export function loopStateOf(claim: RadarClaim): RadarLoopState {
  if (claim.claimStatus) return claim.claimStatus
  if (claim.status === 'detected' || claim.status === 'notified') return 'eligible'
  if (claim.status === 'unverified') return 'unverified'
  if (claim.status === 'ineligible') return 'ineligible'
  return 'closed'
}

/**
 * Midnight-normalized whole days remaining until expiry.
 * Both timestamps are clamped to UTC midnight so a claim expiring later
 * *today* reads "0d", tomorrow "1d" — no partial-day rounding surprises.
 */
export function daysLeftUntil(iso: string, nowMs: number = Date.now()): number {
  const MS_PER_DAY = 86_400_000
  const utcMidnight = (ms: number) => Math.floor(ms / MS_PER_DAY) * MS_PER_DAY
  const diff = utcMidnight(new Date(iso).getTime()) - utcMidnight(nowMs)
  return Math.max(0, Math.round(diff / MS_PER_DAY))
}
