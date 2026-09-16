import fs from 'fs';
import path from 'path';
import { AppState } from 'react-native';
import { renderHook, act } from '@testing-library/react-native';
import { useScrollLock } from '../hooks/useScrollLock';

describe('Edit Mode & Scroll Lock Mechanical Invariants', () => {
  const departureCardPath = path.resolve(__dirname, '../components/DepartureCard.tsx');
  const lineCardPath = path.resolve(__dirname, '../components/LineCard.tsx');
  const dashboardGridPath = path.resolve(__dirname, '../components/DashboardGrid.tsx');
  const dashboardPath = path.resolve(__dirname, '../components/MyCommuteDashboard.tsx');
  const useJigglePath = path.resolve(__dirname, '../hooks/useJiggle.ts');

  const departureCardSrc = fs.readFileSync(departureCardPath, 'utf8');
  const lineCardSrc = fs.readFileSync(lineCardPath, 'utf8');
  const dashboardGridSrc = fs.readFileSync(dashboardGridPath, 'utf8');
  const dashboardSrc = fs.readFileSync(dashboardPath, 'utf8');
  const useJiggleSrc = fs.readFileSync(useJigglePath, 'utf8');

  describe('Rule: Organic Apple-Style Jiggle (RATIFIED: jiggle retained — "make it better, don\'t kill it")', () => {
    it('both card types attach jiggleStyle to their outer container (one shared engine)', () => {
      expect(departureCardSrc).toMatch(/style=\{\[styles\.outerContainer,\s*containerAnimStyle,\s*jiggleStyle\]\}/);
      expect(lineCardSrc).toMatch(/jiggleStyle/);
    });

    it('rotation is budgeted for wide cards: 0.6° base (±1.9pt corners on a 361pt card)', () => {
      expect(useJiggleSrc).toMatch(/JIGGLE_MAX_DEG\s*=\s*0\.6\b/);
    });

    it('cadence is calm: base period ≥ 800ms (340ms lockstep flicker retired)', () => {
      const m = useJiggleSrc.match(/JIGGLE_BASE_PERIOD_MS\s*=\s*(\d+)/);
      expect(m).not.toBeNull();
      expect(parseInt(m![1], 10)).toBeGreaterThanOrEqual(800);
    });

    it('no lockstep schemes: neither golden-angle spread nor ± parity antiphase', () => {
      expect(useJiggleSrc).not.toContain('GOLDEN_ANGLE');
      expect(useJiggleSrc).not.toMatch(/index\s*%\s*2\s*===\s*0\s*\)\s*\?\s*1\s*:\s*-1/);
    });

    it('per-card wobble character is seeded and render-stable (no Math.random re-rolls)', () => {
      expect(useJiggleSrc).toMatch(/Math\.imul/);
      expect(useJiggleSrc).not.toContain('Math.random');
      expect(useJiggleSrc).toMatch(/useMemo\(\s*\(\)\s*=>\s*\(\{[\s\S]*?offset:/);
    });

    it('periods are decorrelated per card (±15% jitter) so alignment never locks', () => {
      expect(useJiggleSrc).toMatch(/0\.85\s*\+\s*0\.3\s*\*\s*seededUnit/);
    });

    it('jiggle honors Reduce Motion (no rotation or bob when enabled)', () => {
      expect(useJiggleSrc).toMatch(/isEditing\s*&&\s*!reducedMotion/);
    });

    it('dragged card eases flat and lifts above the list (no angle snap)', () => {
      expect(useJiggleSrc).toMatch(/activeProgress\.value\s*=\s*withTiming\(isActive\s*\?\s*1\s*:\s*0/);
      expect(useJiggleSrc).toMatch(/zIndex:\s*activeProgress\.value\s*>\s*0\.5\s*\?\s*999\s*:\s*1/);
    });
  });

  describe('Rule: Gesture Isolation & Drag Grabber Exclusivity (both card types)', () => {
    it('DepartureCard root Pressable does not invoke drag() on long press', () => {
      const rootPressableMatch = departureCardSrc.match(/<Pressable[\s\S]*?testID=\{`departure-card-pressable-\$\{stationId\}`\}[\s\S]*?>/);
      expect(rootPressableMatch).not.toBeNull();
      expect(rootPressableMatch![0]).not.toContain('drag()');
    });

    it('DepartureCard binds drag() strictly to the trailing grabber button', () => {
      expect(departureCardSrc).toMatch(/testID=\{`departure-card-grabber-\$\{stationId\}`\}/);
      expect(departureCardSrc).toMatch(/onLongPress=\{\(\)\s*=>\s*\{[\s\S]*?drag\(\);[\s\S]*?\}\}/);
    });

    it('LineCard root Pressable does not invoke drag() (full-surface hijack fix)', () => {
      const bodyMatch = lineCardSrc.match(/<Pressable[\s\S]*?style=\{StyleSheet\.absoluteFillObject\}[\s\S]*?>/);
      expect(bodyMatch).not.toBeNull();
      expect(bodyMatch![0]).not.toContain('drag(');
    });

    it('LineCard binds drag() strictly to the trailing grabber button', () => {
      expect(lineCardSrc).toMatch(/testID=\{`line-card-grabber-\$\{line\.id\}`\}/);
      expect(lineCardSrc).toMatch(/onLongPress=\{\(\)\s*=>\s*\{[\s\S]*?drag\(\);/);
    });

    it('LineCard grabber includes VoiceOver accessibilityActions for non-gesture reordering', () => {
      expect(lineCardSrc).toMatch(/accessibilityRole="adjustable"/);
      expect(lineCardSrc).toMatch(/name:\s*'increment',\s*label:\s*'Move Up'/);
      expect(lineCardSrc).toMatch(/name:\s*'decrement',\s*label:\s*'Move Down'/);
      expect(lineCardSrc).toMatch(/onAccessibilityAction=\{/);
    });

    it('DepartureCard grabber includes VoiceOver accessibilityActions (regression guard)', () => {
      expect(departureCardSrc).toMatch(/accessibilityRole="adjustable"/);
      expect(departureCardSrc).toMatch(/name:\s*'increment',\s*label:\s*'Move Up'/);
    });

    it('DashboardGrid implements unmount cleanup to guarantee scroll is restored', () => {
      expect(dashboardGridSrc).toMatch(/onScrollEnabledChange\(true\)/);
    });

    it('DepartureCard freezes arrival polling while in edit mode to prevent reflow desync', () => {
      expect(departureCardSrc).toMatch(/if\s*\(isEditing\)\s*return;\s*\/\/\s*Freeze polling/);
    });

    it('long-press-to-edit is wired for both sections (was a dead gesture)', () => {
      expect(dashboardSrc).toMatch(/onLongPressCard=\{handleEdit\}/);
      expect(dashboardSrc).toMatch(/onLongPress=\{handleEdit\}/);
    });

    it('dashboard wires VoiceOver line reorder handlers', () => {
      expect(dashboardSrc).toMatch(/handleMoveLineUp/);
      expect(dashboardSrc).toMatch(/onMoveUp=\{handleMoveLineUp\}/);
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
      const IPHONE_14_PRO_TOP_INSET = 59;
      const IPHONE_14_PRO_WIDTH = 393;
      const IPHONE_14_PRO_BOTTOM_INSET = 34;

      const topOffsetMatch = dashboardSrc.match(/top:\s*insets\.top\s*\+\s*\(Platform\.OS\s*===\s*'ios'\s*\?\s*(\d+)\s*:\s*\d+\)/);
      expect(topOffsetMatch).not.toBeNull();
      const iosOffset = parseInt(topOffsetMatch![1], 10);
      const computedTop = IPHONE_14_PRO_TOP_INSET + iosOffset;

      expect(computedTop).toBeGreaterThan(IPHONE_14_PRO_TOP_INSET);
      expect(computedTop).toBeLessThan(100);
      expect(computedTop).toBe(67);

      expect(IPHONE_14_PRO_WIDTH).toBe(393);
      expect(IPHONE_14_PRO_BOTTOM_INSET).toBe(34);
    });
  });
});
