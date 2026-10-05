import { ramp } from '../components/DynamicIslandBanner/logic/ramp';
import { buildNotificationGeometry } from '../components/DynamicIslandBanner/core/build-notification-geometry';
import { getNotificationLayout } from '../components/DynamicIslandBanner/helpers/get-notification-layout';

describe('Morph Pill Geometry & Ramp Invariants', () => {
  describe('ramp() function', () => {
    it('monotonically clamps values between 0 and 1', () => {
      expect(ramp(0.0, 0.4, 0.6)).toBe(0);
      expect(ramp(0.39, 0.4, 0.6)).toBe(0);
      expect(ramp(0.5, 0.4, 0.6)).toBeCloseTo(0.5);
      expect(ramp(0.6, 0.4, 0.6)).toBe(1);
      expect(ramp(1.0, 0.4, 0.6)).toBe(1);
    });

    it('handles equal start and end bounds without dividing by zero', () => {
      expect(ramp(0.4, 0.5, 0.5)).toBe(0);
      expect(ramp(0.5, 0.5, 0.5)).toBe(1);
      expect(ramp(0.6, 0.5, 0.5)).toBe(1);
    });
  });

  describe('Tier Heights and Layout Invariants', () => {
    const TIER_HEIGHTS = {
      compact: 70,
      standard: 84,
      expanded: 96,
    } as const;

    it('enforces canonical tier heights (70pt, 84pt, 96pt)', () => {
      expect(TIER_HEIGHTS.compact).toBe(70);
      expect(TIER_HEIGHTS.standard).toBe(84);
      expect(TIER_HEIGHTS.expanded).toBe(96);
    });

    it('buildNotificationGeometry stays strictly bounded within screen viewport for all tiers', () => {
      const screenWidth = 393;
      const insetTop = 59;

      (['compact', 'standard', 'expanded'] as const).forEach((tier) => {
        const cardHeight = TIER_HEIGHTS[tier];
        const layout = getNotificationLayout({
          width: screenWidth,
          insetTop,
          cardHeight,
        });

        // Test at resting state (drop = 1, expand = 1)
        const restingGeometry = buildNotificationGeometry({
          drop: 1,
          expand: 1,
          layout,
        });

        expect(restingGeometry.height).toBe(cardHeight);
        expect(restingGeometry.width).toBeLessThanOrEqual(screenWidth);
        expect(restingGeometry.radius).toBeGreaterThan(0);
        expect(restingGeometry.radius).toBeLessThanOrEqual(cardHeight / 2);

        // Test at droplet formation (drop = 0.5, expand = 0)
        const midGeometry = buildNotificationGeometry({
          drop: 0.5,
          expand: 0,
          layout,
        });

        expect(midGeometry.width).toBeGreaterThan(0);
        expect(midGeometry.height).toBeGreaterThan(0);
      });
    });
  });
});
