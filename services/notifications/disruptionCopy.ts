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

export const MAX_NOTIFICATION_BODY_CHARS = 230;

export function formatDisruptionNotificationBody(opts: DisruptionBodyInput): string {
  const status = (opts.statusDescription || '').trim();
  const rawCause = (opts.cause || '').trim();

  if (!rawCause) {
    return status;
  }

  // Strip accidental outer parentheses or trailing spaces
  let cleanCause = rawCause.replace(/^\(/, '').replace(/\)$/, '').trim();

  // Strip redundant leading line prefix (e.g. "Northern Line: " or "Northern line - ")
  // to prevent clumsy repetition when the line name is already in the notification title
  cleanCause = cleanCause.replace(/^[a-z0-9\s&-]+line\s*[:-]\s*/i, '').trim();

  let body: string;
  const causeLower = cleanCause.toLowerCase();
  const statusLower = status.toLowerCase();

  // If TfL reason already incorporates the status description, use it directly
  if (causeLower.includes(statusLower)) {
    body = cleanCause;
  } else {
    body = `${status} (${cleanCause})`;
  }

  // Safeguard against lockscreen truncation and mid-word splits:
  // Truncate at whole-word boundary with unicode ellipsis '…'
  if (body.length > MAX_NOTIFICATION_BODY_CHARS) {
    const trimmed = body.slice(0, MAX_NOTIFICATION_BODY_CHARS);
    const lastSpace = trimmed.lastIndexOf(' ');
    if (lastSpace > 160) {
      body = trimmed.slice(0, lastSpace) + '…';
    } else {
      body = trimmed + '…';
    }
  }

  return body;
}
