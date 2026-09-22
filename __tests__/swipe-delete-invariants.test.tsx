import fs from 'fs';
import path from 'path';
import {
  shouldCommitSwipe,
  isSwipeArmed,
  calculateTrashTranslation,
} from '../utils/swipeKinematics';

describe('Swipe-to-Delete Invariants & Direct Manipulation Protocol', () => {
  let swipeableRowSrc = '';
  let dashboardSrc = '';
  let lineCardSrc = '';
  let departureCardSrc = '';

  beforeAll(() => {
    const swipeableRowPath = path.resolve(__dirname, '../components/SwipeableRow.tsx');
    const dashboardPath = path.resolve(__dirname, '../components/MyCommuteDashboard.tsx');
    const lineCardPath = path.resolve(__dirname, '../components/LineCard.tsx');
    const departureCardPath = path.resolve(__dirname, '../components/DepartureCard.tsx');

    swipeableRowSrc = fs.readFileSync(swipeableRowPath, 'utf8');
    dashboardSrc = fs.readFileSync(dashboardPath, 'utf8');
    lineCardSrc = fs.readFileSync(lineCardPath, 'utf8');
    departureCardSrc = fs.readFileSync(departureCardPath, 'utf8');
  });

  describe('1. Pure Kinematics & Decision Math', () => {
    const cardWidth = 350;

    it('commits when dragged past 70% threshold', () => {
      expect(shouldCommitSwipe(-245, 0, cardWidth)).toBe(true);
      expect(shouldCommitSwipe(-250, 0, cardWidth)).toBe(true);
      expect(shouldCommitSwipe(-244, 0, cardWidth)).toBe(false);
    });

    it('commits on fast leftward flick with minimum displacement', () => {
      // 25% displacement = -87.5px. Fast flick = velocity < -800
      expect(shouldCommitSwipe(-90, -850, cardWidth)).toBe(true);
      expect(shouldCommitSwipe(-100, -1200, cardWidth)).toBe(true);
      // Fails if displacement is too small (<25%)
      expect(shouldCommitSwipe(-50, -1200, cardWidth)).toBe(false);
      // Fails if velocity is not high enough
      expect(shouldCommitSwipe(-90, -700, cardWidth)).toBe(false);
    });

    it('arms at 40% threshold for edge-triggered haptic and icon inflation', () => {
      // 40% of 350 = -140px
      expect(isSwipeArmed(-140, cardWidth)).toBe(true);
      expect(isSwipeArmed(-150, cardWidth)).toBe(true);
      expect(isSwipeArmed(-139, cardWidth)).toBe(false);
      expect(isSwipeArmed(0, cardWidth)).toBe(false);
    });

    it('clamps trash icon dynamic translation between [0, -64]', () => {
      expect(calculateTrashTranslation(0, cardWidth)).toBe(-0);
      // Halfway to threshold
      const mid = calculateTrashTranslation(-122.5, cardWidth);
      expect(mid).toBeCloseTo(-32, 0);
      // At full threshold
      expect(calculateTrashTranslation(-245, cardWidth)).toBe(-64);
      // Overshoot is clamped to -64
      expect(calculateTrashTranslation(-350, cardWidth)).toBe(-64);
    });
  });

  describe('2. Gesture Arbitration & Precedence Invariants', () => {
    it('enforces tighter vertical fail slop failOffsetY([-10, 10]) over activeOffsetX([-15, 15])', () => {
      expect(swipeableRowSrc).toMatch(/activeOffsetX\(\s*\[\s*-15,\s*15\s*\]\s*\)/);
      expect(swipeableRowSrc).toMatch(/failOffsetY\(\s*\[\s*-10,\s*10\s*\]\s*\)/);
    });

    it('disables swipe pan while item is dragging', () => {
      expect(swipeableRowSrc).toMatch(/!isDragging/);
    });

    it('provides full VoiceOver accessibilityActions for Delete, Move Up, and Move Down', () => {
      expect(swipeableRowSrc).toMatch(/accessibilityActions/);
      expect(swipeableRowSrc).toMatch(/onAccessibilityAction/);
      expect(swipeableRowSrc).toMatch(/name:\s*'delete'/);
      expect(swipeableRowSrc).toMatch(/name:\s*'increment'/);
      expect(swipeableRowSrc).toMatch(/name:\s*'decrement'/);
    });
  });

  describe('3. Clean Dashboard (Zero-Chrome Invariant)', () => {
    it('has zero edit button or done button in header', () => {
      expect(dashboardSrc).not.toMatch(/accessibilityLabel=['"]Edit layout['"]/);
      expect(dashboardSrc).not.toMatch(/floatingDoneContainer/);
      expect(dashboardSrc).not.toMatch(/testID=['"]floating-done-button['"]/);
    });

    it('has zero minus badges or grabber containers in LineCard', () => {
      expect(lineCardSrc).not.toMatch(/deleteBadgeContainer/);
      expect(lineCardSrc).not.toMatch(/grabberContainer/);
      expect(lineCardSrc).not.toMatch(/deleteBadge/);
    });

    it('has zero minus badges or grabber containers in DepartureCard', () => {
      expect(departureCardSrc).not.toMatch(/deleteBadgeContainer/);
      expect(departureCardSrc).not.toMatch(/grabberContainer/);
      expect(departureCardSrc).not.toMatch(/deleteBadge/);
    });

    it('preserves direct tap navigation and direct long-press drag', () => {
      expect(lineCardSrc).toMatch(/delayLongPress=\{300\}/);
      expect(lineCardSrc).toMatch(/handleLongPress/);
      expect(departureCardSrc).toMatch(/delayLongPress=\{300\}/);
      expect(departureCardSrc).toMatch(/handleBodyLongPress/);
    });
  });
});
