/**
 * swipeKinematics.ts
 * ─────────────────────────────────────────────────────────────────
 * Pure mathematical functions for iOS-style elastic swipe-to-delete.
 * Extracts decision logic to enable pure, deterministic unit testing
 * without requiring complex gesture or worklet mocking.
 * ─────────────────────────────────────────────────────────────────
 */

export interface SwipeDecisionConfig {
  commitRatio?: number;     // e.g. 0.70 (70% of card width)
  armRatio?: number;        // e.g. 0.40 (40% of card width)
  flickVelocity?: number;   // e.g. -800 px/s
  flickMinRatio?: number;   // e.g. 0.25 (25% of card width required for flick)
  maxTrashTravel?: number;  // e.g. 64 pt
}

export const DEFAULT_SWIPE_CONFIG: Required<SwipeDecisionConfig> = {
  commitRatio: 0.70,
  armRatio: 0.40,
  flickVelocity: -800,
  flickMinRatio: 0.25,
  maxTrashTravel: 64,
};

/**
 * Determines whether a swipe gesture should commit a deletion.
 * Commits if dragged past `commitRatio * width` OR on a fast leftward flick
 * past `flickMinRatio * width`.
 */
export function shouldCommitSwipe(
  translateX: number,
  velocityX: number,
  cardWidth: number,
  config: SwipeDecisionConfig = {}
): boolean {
  if (cardWidth <= 0) return false;
  const cfg = { ...DEFAULT_SWIPE_CONFIG, ...config };

  // Full distance commit
  if (translateX <= -cfg.commitRatio * cardWidth) {
    return true;
  }

  // Fast flick commit (velocity exceeds threshold and minimum displacement met)
  if (velocityX < cfg.flickVelocity && translateX <= -cfg.flickMinRatio * cardWidth) {
    return true;
  }

  return false;
}

/**
 * Determines whether the swipe is in the "Armed" state.
 * Armed state triggers an edge-triggered haptic and inflates the trash icon.
 */
export function isSwipeArmed(
  translateX: number,
  cardWidth: number,
  config: SwipeDecisionConfig = {}
): boolean {
  if (cardWidth <= 0) return false;
  const armRatio = config.armRatio ?? DEFAULT_SWIPE_CONFIG.armRatio;
  return translateX <= -armRatio * cardWidth;
}

/**
 * Calculates the dynamic X-translation for the trash icon tracking finger motion.
 * Clamps translation so icon never drifts into content or off the card.
 */
export function calculateTrashTranslation(
  translateX: number,
  cardWidth: number,
  config: SwipeDecisionConfig = {}
): number {
  if (cardWidth <= 0) return 0;
  const commitRatio = config.commitRatio ?? DEFAULT_SWIPE_CONFIG.commitRatio;
  const maxTravel = config.maxTrashTravel ?? DEFAULT_SWIPE_CONFIG.maxTrashTravel;

  const threshold = commitRatio * cardWidth;
  if (threshold <= 0) return 0;

  // Linear progression clamped between [-maxTravel, 0]
  const progress = Math.min(Math.max(-translateX / threshold, 0), 1);
  return -progress * maxTravel;
}
