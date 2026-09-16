import fs from 'fs';
import path from 'path';
import React from 'react';
import { View, Text, Pressable, AppState } from 'react-native';
import { renderHook, act } from '@testing-library/react-native';
import { useScrollLock } from '../hooks/useScrollLock';

describe('Edit Mode & Scroll Lock Mechanical Invariants', () => {
  const departureCardPath = path.resolve(__dirname, '../components/DepartureCard.tsx');
  const dashboardGridPath = path.resolve(__dirname, '../components/DashboardGrid.tsx');
  const dashboardPath = path.resolve(__dirname, '../components/MyCommuteDashboard.tsx');

  const departureCardSrc = fs.readFileSync(departureCardPath, 'utf8');
  const dashboardGridSrc = fs.readFileSync(dashboardGridPath, 'utf8');
  const dashboardSrc = fs.readFileSync(dashboardPath, 'utf8');

  describe('Rule: No Rotational Jiggle on Full-Width Cards', () => {
    it('DepartureCard does not attach jiggleStyle or rotate transform to its outer container', () => {
      // Invariant: Cards must remain level, stationary, and horizontal (HIG standard)
      expect(departureCardSrc).not.toMatch(/style=\{?\[styles\.outerContainer,\s*containerAnimStyle,\s*jiggleStyle\]\}?/);
      expect(departureCardSrc).toMatch(/style=\{?\[styles\.outerContainer,\s*containerAnimStyle\]\}?/);
    });
  });

  describe('Rule: Gesture Isolation & Drag Grabber Exclusivity', () => {
    it('DepartureCard root Pressable does not invoke drag() on long press', () => {
      // Invariant: The card body must be passive so vertical scrolling is never hijacked
      const rootPressableMatch = departureCardSrc.match(/<Pressable[\s\S]*?testID=\{`departure-card-pressable-\$\{stationId\}`\}[\s\S]*?>/);
      expect(rootPressableMatch).not.toBeNull();
      const rootPressableContent = rootPressableMatch![0];
      expect(rootPressableContent).not.toContain('drag()');
    });

    it('DepartureCard binds drag() strictly to the trailing grabber button', () => {
      // Invariant: Dragging is only initiated from the dedicated grabber handle
      expect(departureCardSrc).toMatch(/testID=\{`departure-card-grabber-\$\{stationId\}`\}/);
      expect(departureCardSrc).toMatch(/onLongPress=\{\(\)\s*=>\s*\{[\s\S]*?drag\(\);[\s\S]*?\}\}/);
    });

    it('DepartureCard grabber includes VoiceOver accessibilityActions for non-gesture reordering', () => {
      // Invariant: WCAG & Apple HIG accessibility contract for reordering
      expect(departureCardSrc).toMatch(/accessibilityRole="adjustable"/);
      expect(departureCardSrc).toMatch(/name:\s*'increment',\s*label:\s*'Move Up'/);
      expect(departureCardSrc).toMatch(/name:\s*'decrement',\s*label:\s*'Move Down'/);
      expect(departureCardSrc).toMatch(/onAccessibilityAction=\{/);
    });

    it('DashboardGrid implements unmount cleanup to guarantee scroll is restored', () => {
      // Invariant: If unmounted while scroll locked, scroll must be unconditionally unlocked
      expect(dashboardGridSrc).toMatch(/onScrollEnabledChange\(true\)/);
    });

    it('DepartureCard freezes arrival polling while in edit mode to prevent reflow desync', () => {
      // Invariant: No mid-drag data mutations or index shifting
      expect(departureCardSrc).toMatch(/if\s*\(isEditing\)\s*return;\s*\/\/\s*Freeze polling/);
    });
  });

  describe('Rule: Exactly-One-Done Escape Hatch Architecture', () => {
    it('MyCommuteDashboard mounts a persistent floating Done button in edit mode', () => {
      expect(dashboardSrc).toMatch(/testID="floating-done-button"/);
      expect(dashboardSrc).toMatch(/dash\.floatingDoneBtn/);
    });

    it('MyCommuteDashboard suppresses in-header Edit button during edit mode to avoid dual-Done collision', () => {
      expect(dashboardSrc).toMatch(/isEditing\s*&&\s*\{\s*opacity:\s*0,\s*pointerEvents:\s*'none'\s*\}/);
    });

    it('Floating Done button disables pointerEvents during active drag to prevent mid-gesture race', () => {
      expect(dashboardSrc).toMatch(/pointerEvents=\{isDraggingLine\s*\|\|\s*isDraggingStation\s*\?\s*'none'\s*:\s*'auto'\}/);
    });
  });

  describe('useScrollLock State & Interruption Recovery Hook', () => {
    it('manages scrollEnabled and unlocks cleanly on demand', async () => {
      const { result } = await renderHook(() => useScrollLock());
      expect(result.current.scrollEnabled).toBe(true);

      await act(async () => {
        result.current.lockScroll();
      });
      expect(result.current.scrollEnabled).toBe(false);

      await act(async () => {
        result.current.unlockScroll();
      });
      expect(result.current.scrollEnabled).toBe(true);
    });

    it('forceReset restores scrollEnabled to true and calls onForceReset callback', async () => {
      const onForceReset = jest.fn();
      const { result } = await renderHook(() => useScrollLock({ onForceReset }));

      await act(async () => {
        result.current.lockScroll();
      });
      expect(result.current.scrollEnabled).toBe(false);

      await act(async () => {
        result.current.forceReset();
      });
      expect(result.current.scrollEnabled).toBe(true);
      expect(onForceReset).toHaveBeenCalledTimes(1);
    });

    it('force-resets on AppState background transition to prevent trapped relaunch', async () => {
      const onForceReset = jest.fn();
      const listeners: Record<string, (state: string) => void> = {};

      const addEventListenerSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation((event, handler) => {
        listeners[event] = handler as (state: string) => void;
        return { remove: jest.fn() } as any;
      });

      const { result } = await renderHook(() => useScrollLock({ onForceReset }));

      await act(async () => {
        result.current.lockScroll();
      });
      expect(result.current.scrollEnabled).toBe(false);

      // Simulate OS sending app to background
      await act(async () => {
        listeners['change']?.('background');
      });

      expect(result.current.scrollEnabled).toBe(true);
      expect(onForceReset).toHaveBeenCalled();

      addEventListenerSpy.mockRestore();
    });
  });

  describe('iPhone 14 Pro Display & Dynamic Island Geometry Contract', () => {
    it('verifies floating Done button top offset clears iPhone 14 Pro Dynamic Island', () => {
      // iPhone 14 Pro hardware spec: 393 × 852 pt, top inset 59pt (Dynamic Island)
      const IPHONE_14_PRO_TOP_INSET = 59;
      const IPHONE_14_PRO_WIDTH = 393;
      const IPHONE_14_PRO_BOTTOM_INSET = 34;

      // In MyCommuteDashboard.tsx, floatingDoneContainer is anchored at insets.top + 8
      const topOffsetMatch = dashboardSrc.match(/top:\s*insets\.top\s*\+\s*\(Platform\.OS\s*===\s*'ios'\s*\?\s*(\d+)\s*:\s*\d+\)/);
      expect(topOffsetMatch).not.toBeNull();
      const iosOffset = parseInt(topOffsetMatch![1], 10);
      const computedTop = IPHONE_14_PRO_TOP_INSET + iosOffset;

      // Must be safely below Dynamic Island (59pt) but within standard top navigation bar (under 100pt)
      expect(computedTop).toBeGreaterThan(IPHONE_14_PRO_TOP_INSET);
      expect(computedTop).toBeLessThan(100);
      expect(computedTop).toBe(67); // 59 + 8 = 67pt
    });
  });
});
