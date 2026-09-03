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
} from '../hooks/useClaimArrivalAnimation';
import {
  loopStateOf,
  daysLeftUntil,
  shouldMountEarnedUI,
  type RadarClaim,
} from '../components/refunds/types';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import LifetimeMetricsCard from '../components/refunds/LifetimeMetricsCard';
import TfLConnectSheet from '../components/refunds/TfLConnectSheet';
import { SlaSurveyModal } from '../components/refunds/SlaSurveyModal';
import ZeroStateHeroCard from '../components/refunds/ZeroStateHeroCard';
import {
  isSurveySnoozed,
  snoozeSurvey,
} from '../services/refundSlaService';

// ── Lightweight reanimated stub (hook under test only uses these symbols) ──
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: {
      View,
    },
    useSharedValue: (init: number) => ({ value: init }),
    withTiming: (target: number) => target,
    withRepeat: (anim: unknown) => anim,
    useAnimatedStyle: (fn: () => unknown) => fn(),
    Easing: {
      out: (fn: (x: number) => number) => fn,
      inOut: (fn: (x: number) => number) => fn,
      ease: (x: number) => x,
      expo: (x: number) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x)),
    },
    useReducedMotion: () => false,
    useAnimatedReaction: () => undefined,
    runOnJS: (fn: unknown) => fn,
  };
});

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

describe('Radar v2 — 5. TfLConnectSheet streamlined 6-element decision sheet', () => {
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

  it('renders streamlined single-path elements with flattened Apple Pay guidance', async () => {
    const { getByText, getByLabelText } = await setup();
    expect(getByText('Stop losing money to TfL delays.')).toBeTruthy(); // 1. Headline
    expect(getByText('Connect once for a 28-day claim window.')).toBeTruthy(); // Subtitle
    expect(getByLabelText('Close sheet')).toBeTruthy(); // 2. Top-right close X
    expect(getByText('Full Protection')).toBeTruthy(); // 3. Recommended card title
    expect(getByText('28 DAYS')).toBeTruthy(); // 4. 28-Day badge
    expect(getByText(/Apple Pay \/ Google Pay: link the card behind your phone/)).toBeTruthy(); // Flattened tip
    expect(getByText(/Opens official TfL portal. We never see your password./)).toBeTruthy(); // 5. Security trust note
    expect(getByText('Unlock 28-Day Refunds')).toBeTruthy(); // 6. Primary CTA
    expect(getByText('Skip · Lose delays after 7 days')).toBeTruthy(); // 7. Consequence Skip text
  });

  it('switches modes: register → onRegistered, skip → onUnregistered, X → onClose', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      // Simulate user clicking 'Yes, signed in'
      buttons?.find((b) => b.text === 'Yes, signed in')?.onPress?.();
    });
    const { getByText, getByLabelText, onRegistered, onUnregistered, onClose } = await setup();
    fireEvent.press(getByText('Unlock 28-Day Refunds'));
    await waitFor(() => expect(onRegistered).toHaveBeenCalledTimes(1));
    fireEvent.press(getByText('Skip · Lose delays after 7 days'));
    await waitFor(() => expect(onUnregistered).toHaveBeenCalledTimes(1));
    fireEvent.press(getByLabelText('Close sheet'));
    expect(onClose).toHaveBeenCalledTimes(2);
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

describe('Radar v2 — 7. ZeroStateHeroCard 10/10 & Disappearing Coverage Architecture', () => {
  it('renders live breathing indicator and canonical 2-line reassurance', async () => {
    const screen = await render(<ZeroStateHeroCard checkedAtIso={null} isRegistered28Day={false} />);
    expect(screen.getByText('RADAR SENTINEL')).toBeTruthy();
    expect(screen.getByText('LIVE')).toBeTruthy();
    expect(screen.getByText('ALL CORRIDORS CLEAR')).toBeTruthy();
    expect(screen.getByText('No Delays Detected Today')).toBeTruthy();
    expect(screen.getByText(/Monitoring your lines 24\/7/)).toBeTruthy();
    expect(screen.queryByText('28D PROTECTED')).toBeNull();
  });

  it('renders 28D PROTECTED badge when isRegistered28Day is true', async () => {
    const screen = await render(<ZeroStateHeroCard checkedAtIso={null} isRegistered28Day={true} />);
    expect(screen.getByText('28D PROTECTED')).toBeTruthy();
    expect(screen.getByText('LIVE')).toBeTruthy();
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
