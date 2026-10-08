/**
 * disruptionCopy.ts (Frontend)
 * ─────────────────────────────────────────────────────────────────
 * Single source of truth for disruption notification body formatting.
 *
 * INVARIANT:
 * Notification body must ONLY contain authentic TfL API data (status and cause/reason).
 * Must NEVER append fabricated alternative lines, fake delta minutes (+X min),
 * or unverified "running normally" claims.
 */

export interface DisruptionBodyInput {
  statusDescription: string;
  cause?: string | null;
}

export function formatDisruptionNotificationBody(opts: DisruptionBodyInput): string {
  const status = (opts.statusDescription || '').trim();
  const rawCause = (opts.cause || '').trim();

  if (!rawCause) {
    return status;
  }

  // Strip accidental outer parentheses or trailing spaces
  const cleanCause = rawCause.replace(/^\(/, '').replace(/\)$/, '').trim();

  // If TfL reason already incorporates the status description, use it directly
  // to prevent clumsy repetition like "Severe Delays (Northern Line: Severe delays...)"
  if (cleanCause.toLowerCase().includes(status.toLowerCase())) {
    return cleanCause;
  }

  // If cause is a reason clause without status description, format as "Status (Reason)"
  return `${status} (${cleanCause})`;
}
