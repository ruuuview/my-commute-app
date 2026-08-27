/// <reference types="jest" />
/**
 * Radar v2 Automated Verification Suite (refunds-v2.test.tsx)
 *
 * Covers master-plan §6:
 *  1. Signal Lock — odometer formatting + MMKV last_animated_claim_id gate
 *     (bypass on remount/tab-switch).
 *  2. Earned UI conditional mounting (0 settled → unmounted, >0 → mounted).
 *  3. Dynamic 28d vs 7d midnight-normalized expiry arithmetic.
 *  4. Offline optimistic dismissal + local submission queueing + prune.
 *  5. TfLConnectSheet 4-block mode switches.
 *
 * NOTE: @testing-library/react-native@14 → render() returns a Promise; every
 * render call below is awaited (async tests).
 */

import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  useClaimArrivalAnimation,
  formatOdometer,
} from '@/hooks/useClaimArrivalAnimation';
import {
  loopStateOf,
  daysLeftUntil,
  shouldMountEarnedUI,
  type RadarClaim,
} from '@/components/refunds/types';
import { useUserPreferencesStore } from '@/store/userPreferencesStore';
import LifetimeMetricsCard from '@/components/refunds/LifetimeMetricsCard';
import TfLConnectSheet from '@/components/refunds/TfLConnectSheet';
import { SlaSurveyModal } from '@/components/refunds/SlaSurveyModal';
import {
  isSurveySnoozed,
  snoozeSurvey,
} from '@/services/refundSlaService';

// ── Lightweight reanimated stub (hook under test only uses these symbols) ──
jest.mock('react-native-reanimated', () => ({
  useSharedValue: (init: number) => ({ value: init }),
  withTiming: (target: number) => target,
  Easing: {
    out: (fn: (x: number) => number) => fn,
    expo: (x: number) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  },
  useReducedMotion: () => false,
  useAnimatedReaction: () => undefined,
  runOnJS: (fn: unknown) => fn,
}));

const baseClaim = (overrides: Partial<RadarClaim> = {}): RadarClaim => ({
  id: 501,
  status: 'notified',
  claimStatus: null,
  filedAt: null,
  receivedAt: null,
  amountPence: 340,
  cause: 'Signal failure',
  causeEligible: true,
  delayMinutes: 22,
  expiresAt: new Date(Date.now() + 20 * 86400000).toISOString(),
  createdAt: new Date().toISOString(),
  lineId: 'victoria',
  operator: 'tfl',
  entryStation: 'Walthamstow Central',
  exitStation: 'Victoria',
  entryTime: new Date().toISOString(),
  exitTime: null,
  windowCause: null,
  journeySpec: null,
  ...overrides,
});

describe('Radar v2 — 1. Signal Lock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('formats odometer pence as GBP currency', () => {
    expect(formatOdometer(0)).toBe('£0.00');
    expect(formatOdometer(340)).toBe('£3.40');
    expect(formatOdometer(123456)).toBe('£1234.56');
  });

  it('animates once on first arrival (0→1 claims) and BYPASSES on remount with the same id', async () => {
    // Fresh MMKV mock store → first sight of claim 777.
    const first = await renderHookWithFreshGate([777]);
    expect(first.shouldAnimate).toBe(true);

    // Remount / tab-switch with SAME id → gate stored in MMKV → static.
    const second = await renderHookWithFreshGate([777]);
    expect(second.shouldAnimate).toBe(false);

    // A NEW claim id must animate again.
    const third = await renderHookWithFreshGate([888]);
    expect(third.shouldAnimate).toBe(true);
  });
});

describe('Radar v2 — 2. Earned UI disclosure', () => {
  it('gates the metrics tile on settled claim count', () => {
    expect(shouldMountEarnedUI(0)).toBe(false);
    expect(shouldMountEarnedUI(1)).toBe(true);
    expect(shouldMountEarnedUI(12)).toBe(true);
  });

  it('renders recovered + settled values when mounted', async () => {
    const screen = await render(
      <LifetimeMetricsCard recoveredTotalPence={680} settledCount={2} />
    );
    expect(
      screen.getByLabelText('Lifetime recovered £6.80 across 2 settled claims')
    ).toBeTruthy();
  });
});

describe('Radar v2 — 3. Midnight-normalized expiry arithmetic', () => {
  const DAY = 86_400_000;

  it('counts whole days to expiry regardless of intra-day offsets', () => {
    const now = Date.UTC(2026, 7, 26, 14, 30); // 26 Aug 2026 14:30 UTC
    expect(daysLeftUntil(new Date(now + DAY).toISOString(), now)).toBe(1);
    expect(daysLeftUntil(new Date(now + 7 * DAY).toISOString(), now)).toBe(7);
    expect(daysLeftUntil(new Date(now + 28 * DAY).toISOString(), now)).toBe(28);
  });

  it('reads 0d for expiry later today and clamps overdue to 0', () => {
    const now = Date.UTC(2026, 7, 26, 9, 0);
    expect(daysLeftUntil(new Date(now + 3 * 3600_000).toISOString(), now)).toBe(0);
    expect(daysLeftUntil(new Date(now - 2 * DAY).toISOString(), now)).toBe(0);
  });
});

describe('Radar v2 — 4. Optimistic offline dismissal & queueing', () => {
  beforeEach(() => {
    useUserPreferencesStore.setState({
      submittedClaims: {},
      dismissedClaims: [],
    });
  });

  it('queues locally-filed claims instantly with epoch timestamp', () => {
    const before = Date.now();
    useUserPreferencesStore.getState().markClaimSubmittedLocally(501);
    const queued = useUserPreferencesStore.getState().submittedClaims['501'];
    expect(queued).toBeGreaterThanOrEqual(before);
    expect(queued).toBeLessThanOrEqual(Date.now());
  });

  it('records dismissal and prunes BOTH mirrors only for forgotten ids', () => {
    const s = useUserPreferencesStore.getState();
    s.markClaimSubmittedLocally(502, 1756000000000);
    s.dismissClaimLocally(503);

    let state = useUserPreferencesStore.getState();
    expect(state.submittedClaims['502']).toBe(1756000000000);
    expect(state.dismissedClaims).toContain('503');

    // Server confirms 502 filed + 503 purged → forget exactly those ids.
    useUserPreferencesStore.getState().pruneLocalClaimRecords([502, 503]);
    state = useUserPreferencesStore.getState();
    expect(state.submittedClaims['502']).toBeUndefined();
    expect(state.dismissedClaims).not.toContain('503');
  });

  it('derives client loop states from server fields', () => {
    expect(loopStateOf(baseClaim())).toBe('eligible');
    expect(loopStateOf(baseClaim({ claimStatus: 'filed' }))).toBe('filed');
    expect(loopStateOf(baseClaim({ status: 'unverified' }))).toBe('unverified');
    expect(loopStateOf(baseClaim({ status: 'ineligible' }))).toBe('ineligible');
    expect(loopStateOf(baseClaim({ status: 'expired' }))).toBe('closed');
  });
});

describe('Radar v2 — 5. TfLConnectSheet 4-block decision sheet', () => {
  const setup = async () => {
    const onRegistered = jest.fn();
    const onUnregistered = jest.fn();
    const onClose = jest.fn();
    const utils = await render(
      <TfLConnectSheet
        visible={true}
        onClose={onClose}
        onRegistered={onRegistered}
        onUnregistered={onUnregistered}
      />
    );
    return { onRegistered, onUnregistered, onClose, ...utils };
  };

  it('renders all four decision blocks', async () => {
    const { getByText } = await setup();
    expect(getByText('Link Your Travel Card or Phone')).toBeTruthy(); // Block 1
    expect(getByText('Card or Phone Registered on TfL')).toBeTruthy(); // Block 2 row A
    expect(getByText(/Only 7 days of journey history/)).toBeTruthy(); // Block 2 row B
    expect(getByText(/Using Apple Pay or Google Pay\?/)).toBeTruthy(); // Explainer callout
    expect(getByText('Sign In / Link Card or Phone on TfL')).toBeTruthy(); // Block 3 CTA
    expect(getByText(/Continue with 7-Day Window/)).toBeTruthy(); // Block 4 pill
  });

  it('switches modes: register → onRegistered, 7-day pill → onUnregistered', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      // Simulate user clicking 'Yes, signed in'
      buttons?.find((b) => b.text === 'Yes, signed in')?.onPress?.();
    });
    const { getByText, onRegistered, onUnregistered } = await setup();
    fireEvent.press(getByText('Sign In / Link Card or Phone on TfL'));
    await waitFor(() => expect(onRegistered).toHaveBeenCalledTimes(1));
    fireEvent.press(getByText(/Continue with 7-Day Window/));
    await waitFor(() => expect(onUnregistered).toHaveBeenCalledTimes(1));
    alertSpy.mockRestore();
  });
});

describe('Radar v2 — 6. Day-14 survey snooze (regression: /review catch)', () => {
  it('STILL_WAITING persists the 3-day quiet period via MMKV', async () => {
    expect(isSurveySnoozed(4242)).toBe(false);
    let submittedId: number | null = null;
    const screen = await render(
      <SlaSurveyModal
        visible={true}
        claim={baseClaim({ id: 4242, claimStatus: 'filed', filedAt: new Date(Date.now() - 15 * 86400000).toISOString() })}
        onClose={() => {}}
        onSubmit={(id: number) => {
          // Mirrors both screens' handlers: persist quiet period on STILL_WAITING.
          submittedId = id;
          snoozeSurvey(id);
        }}
      />
    );
    fireEvent.press(screen.getByText(/Still Waiting/));
    await waitFor(() => expect(submittedId).toBe(4242));
    expect(isSurveySnoozed(4242)).toBe(true);
  });
});

// ── Helper: fresh hook render returning the gate decision ──────────────────
async function renderHookWithFreshGate(activeIds: number[]): Promise<{
  shouldAnimate: boolean;
}> {
  let captured: { shouldAnimate: boolean } | null = null;
  function Probe(): React.ReactElement | null {
    const result = useClaimArrivalAnimation(
      activeIds.map((id) => ({ id }))
    );
    // Captured synchronously during the first render pass — before effects.
    if (!captured) captured = { shouldAnimate: result.shouldAnimate };
    return null;
  }
  await render(<Probe />);
  return captured ?? { shouldAnimate: false };
}
