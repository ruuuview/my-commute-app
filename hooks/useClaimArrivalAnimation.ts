import { createMMKV } from 'react-native-mmkv';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from 'react-native-reanimated';
import { useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { useState, useEffect, useRef } from 'react';

export const SIGNAL_LOCK_DURATION_MS = 450;
export const COLOR_EMERALD = '#10B981';
export const COLOR_AMBER = '#F59E0B';

const refundsStorage = createMMKV({ id: 'refunds-storage' });

export function useClaimArrivalAnimation(activeClaims: {id:number|string}[]) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return { shouldAnimate: false, animatedClaimId: null };
  }

  const lastAnimatedId = refundsStorage.getString('last_animated_claim_id');

  if (activeClaims.length === 0) {
    return { shouldAnimate: false, animatedClaimId: null };
  }

  if (activeClaims.length > 1) {
    return { shouldAnimate: false, animatedClaimId: null };
  }

  // Exactly one active claim
  const claimId = activeClaims[0].id;
  const claimIdStr = String(claimId);

  // Gate: if stored id matches current id → shouldAnimate false (remount/tab-switch bypass)
  if (lastAnimatedId !== null && claimIdStr === lastAnimatedId) {
    return { shouldAnimate: false, animatedClaimId: claimId };
  }

  // New claim or 0→1 transition: store id and animate once
  refundsStorage.set('last_animated_claim_id', claimIdStr);
  return { shouldAnimate: true, animatedClaimId: claimId };
}

export function useOdometer(targetPence: number, run: boolean) {
  const reducedMotion = useReducedMotion();
  const animatedValue = useSharedValue(0);
  const hapticDone = useRef(false);
  const runRef = useRef(run);

  if (reducedMotion) {
    // No animation in reduced motion, static final values
    animatedValue.value = targetPence;
    return animatedValue;
  }

  // When run becomes true (transitions from false to true), start animation
  if (run && !runRef.current) {
    animatedValue.value = withTiming(
      targetPence,
      { duration: SIGNAL_LOCK_DURATION_MS, easing: Easing.out(Easing.exp) },
      () => {
        // completion callback
      }
    );
  }

  runRef.current = run;

  // If run is false, reset value and haptic state
  if (!run) {
    animatedValue.value = 0;
    hapticDone.current = false;
  }

  return animatedValue;
}

export function formatOdometer(pence: number): string {
  return '£' + (pence / 100).toFixed(2);
}