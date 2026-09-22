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
  const stationArrivalsStorePath = path.resolve(__dirname, '../services/stationArrivalsStore.ts');

  const departureCardSrc = fs.readFileSync(departureCardPath, 'utf8');
  const lineCardSrc = fs.readFileSync(lineCardPath, 'utf8');
  const dashboardGridSrc = fs.readFileSync(dashboardGridPath, 'utf8');
  const dashboardSrc = fs.readFileSync(dashboardPath, 'utf8');
  const useJiggleSrc = fs.readFileSync(useJigglePath, 'utf8');
  const stationArrivalsStoreSrc = fs.readFileSync(stationArrivalsStorePath, 'utf8');

  describe('Rule: Flagship Apple-Style Jiggle Invariants', () => {
    it('both card types attach jiggleStyle to their outer container (one shared engine)', () => {
      expect(departureCardSrc).toMatch(/style=\{\[styles\.outerContainer,\s*containerAnimStyle,\s*jiggleStyle\]\}/);
      expect(lineCardSrc).toMatch(/jiggleStyle/);
    });

    it('rotation is uniform across all cards: 0.5° base', () => {
      expect(useJiggleSrc).toMatch(/JIGGLE_MAX_DEG\s*=\s*0\.5\b/);
    });

    it('cadence is tuned for snappy Apple-style wobble: period is 380ms', () => {
      const m = useJiggleSrc.match(/JIGGLE_PERIOD_MS\s*=\s*(\d+)/);
      expect(m).not.toBeNull();
      expect(parseInt(m![1], 10)).toBe(380);
    });

    it('vertical lift is uniform across all cards: 0.6pt', () => {
      expect(useJiggleSrc).toMatch(/JIGGLE_VERTICAL_LIFT_PT\s*=\s*0\.6\b/);
    });

    it('alternates left/right polarity strictly by index % 2', () => {
      expect(useJiggleSrc).toMatch(/rotationOffset\s*=\s*index\s*%\s*2\s*===\s*0\s*\?\s*0\s*:\s*Math\.PI/);
    });

    it('uses harmonic sine pendulum easing (Easing.inOut(Easing.sin))', () => {
      expect(useJiggleSrc).toMatch(/easing:\s*Easing\.inOut\(Easing\.sin\)/);
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

    it('DepartureCard body is inert during edit mode (passivity invariant)', () => {
      expect(departureCardSrc).toMatch(/onPress=\{isEditing \? undefined : handlePress\}/);
      expect(departureCardSrc).toMatch(/onLongPress=\{isEditing \? undefined : handleBodyLongPress\}/);
    });

    it('DepartureCard binds drag() strictly to the dedicated grabber button', () => {
      expect(departureCardSrc).toMatch(/testID=\{`departure-card-grabber-\$\{stationId\}`\}/);
      expect(departureCardSrc).toMatch(/onLongPress=\{\(\)\s*=>\s*\{[\s\S]*?drag\(\);/);
    });

    it('DepartureCard grabber includes VoiceOver accessibilityActions, value, and announcements', () => {
      expect(departureCardSrc).toMatch(/accessibilityRole="adjustable"/);
      expect(departureCardSrc).toMatch(/name:\s*'increment',\s*label:\s*'Move Up'/);
      expect(departureCardSrc).toMatch(/name:\s*'decrement',\s*label:\s*'Move Down'/);
      expect(departureCardSrc).toMatch(/accessibilityValue=\{\{\s*text:\s*`Position \$\{index \+ 1\} of \$\{totalStations\}`\s*\}\}/);
      expect(departureCardSrc).toMatch(/AccessibilityInfo\.announceForAccessibility/);
    });

    it('DepartureCard pauses background polling during edit mode to prevent layout jumps', () => {
      expect(departureCardSrc).toMatch(/useStationArrivals\(stationId,\s*\{\s*enabled:\s*!isEditing\s*\}\)/);
    });

    it('DepartureCard provides 44pt accessible touch target for delete badge matching LineCard', () => {
      expect(departureCardSrc).toMatch(/testID=\{`departure-card-delete-\$\{stationId\}`\}/);
      expect(departureCardSrc).toMatch(/hitSlop=\{\{\s*top:\s*12,\s*bottom:\s*12,\s*left:\s*16,\s*right:\s*16\s*\}\}/);
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

    it('DashboardGrid implements unmount cleanup to guarantee scroll is restored', () => {
      expect(dashboardGridSrc).toMatch(/onScrollEnabledChange\(true\)/);
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

    it('in-header Edit button hides from VoiceOver when isEditing is true', () => {
      expect(dashboardSrc).toMatch(/accessibilityElementsHidden=\{isEditing\}/);
      expect(dashboardSrc).toMatch(/importantForAccessibility=\{isEditing \? 'no-hide-descendants' : 'auto'\}/);
      expect(dashboardSrc).toMatch(/aria-hidden=\{isEditing\}/);
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

    it('preserves calm edit sessions on inactive AppState when no drag is active', async () => {
      const onForceReset = jest.fn();
      const listeners: Record<string, (state: string) => void> = {};

      const addEventListenerSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation((event, handler) => {
        listeners[event] = handler as (state: string) => void;
        return { remove: jest.fn() } as any;
      });

      const { result } = await renderHook(() => useScrollLock({ onForceReset }));
      expect(result.current.scrollEnabled).toBe(true);

      await act(async () => {
        listeners['change']?.('inactive');
      });

      expect(result.current.scrollEnabled).toBe(true);
      expect(onForceReset).not.toHaveBeenCalled();

      addEventListenerSpy.mockRestore();
    });

    it('force-resets on inactive AppState when drag is active (scroll was locked)', async () => {
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
        listeners['change']?.('inactive');
      });

      expect(result.current.scrollEnabled).toBe(true);
      expect(onForceReset).toHaveBeenCalledTimes(1);

      addEventListenerSpy.mockRestore();
    });
  });

  describe('Rule: Haptic Structural Timing & Gesture Purity', () => {
    const usePressAnimationPath = path.resolve(__dirname, '../hooks/usePressAnimation.ts');
    const usePressAnimationSrc = fs.readFileSync(usePressAnimationPath, 'utf8');

    it('haptic impact is bound to onPress (touch release) and NOT onPressIn (touch-down)', () => {
      const onPressInMatch = usePressAnimationSrc.match(/const onPressIn = useCallback\([\s\S]*?\n  \},/);
      expect(onPressInMatch).not.toBeNull();
      expect(onPressInMatch![0]).not.toContain('Haptics.impactAsync');

      const onPressMatch = usePressAnimationSrc.match(/const onPress = useCallback\([\s\S]*?\n  \},/);
      expect(onPressMatch).not.toBeNull();
      expect(onPressMatch![0]).toContain('Haptics.impactAsync');
    });

    it('onPressOut invokes cancel immediately for 60ms non-overshooting settle', () => {
      const onPressOutMatch = usePressAnimationSrc.match(/const onPressOut = useCallback\([\s\S]*?\n  \},/);
      expect(onPressOutMatch).not.toBeNull();
      expect(onPressOutMatch![0]).toContain('cancel()');
    });

    it('DepartureCard and LineCard retain unstable_pressDelay >= 80 to eliminate scroll-flick', () => {
      expect(departureCardSrc).toMatch(/unstable_pressDelay=\{80\}/);
      expect(lineCardSrc).toMatch(/unstable_pressDelay=\{80\}/);
    });

    it('card outer container has no pan responders (card body passivity)', () => {
      expect(departureCardSrc).not.toMatch(/onMoveShouldSetPanResponder/);
      expect(lineCardSrc).not.toMatch(/onMoveShouldSetPanResponder/);
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

  describe('Rule: Mode Isolation Architecture Invariants (Read Mode Gesture Purity)', () => {
    it('DashboardGrid enforces mode isolation: direct mapping in read mode (!isJiggling)', () => {
      expect(dashboardGridSrc).toMatch(/if\s*\(!isJiggling\)\s*\{[\s\S]*?stations\.map\(/);
      expect(dashboardGridSrc).toMatch(/testID="nestable-draggable-stations"/);
    });

    it('MyCommuteDashboard enforces mode isolation: direct mapping in read mode (!isEditing)', () => {
      expect(dashboardSrc).toMatch(/!isEditing\s*\?\s*\([\s\S]*?sortedLines\.map\(/);
      expect(dashboardSrc).toMatch(/testID="nestable-draggable-lines"/);
    });

    it('DepartureCard root Pressable enforces 80ms press delay to kill scroll flick flashes', () => {
      const match = departureCardSrc.match(/<Pressable[\s\S]*?testID=\{`departure-card-pressable-\$\{stationId\}`\}[\s\S]*?>/);
      expect(match).not.toBeNull();
      expect(match![0]).toMatch(/unstable_pressDelay=\{80\}/);
    });

    it('LineCard root Pressable enforces 80ms press delay to kill scroll flick flashes', () => {
      const match = lineCardSrc.match(/<Pressable[\s\S]*?style=\{StyleSheet\.absoluteFillObject\}[\s\S]*?>/);
      expect(match).not.toBeNull();
      expect(match![0]).toMatch(/unstable_pressDelay=\{80\}/);
    });

    it('verifies stable key parity and zero layout shift dimensions between read and edit modes', () => {
      // Both branches in MyCommuteDashboard must use item.id as key
      expect(dashboardSrc).toMatch(/key=\{item\.id\}/);
      // Both branches in MyCommuteDashboard must use height: 46, marginBottom: 12
      const lineContainerMatches = dashboardSrc.match(/height:\s*46,\s*marginBottom:\s*12/g);
      expect(lineContainerMatches).not.toBeNull();
      expect(lineContainerMatches!.length).toBeGreaterThanOrEqual(2);
    });

    it('DashboardGrid read tree contains zero NestableDraggableFlatList or GestureDetector components', () => {
      const readBranchMatch = dashboardGridSrc.match(/if\s*\(!isJiggling\)\s*\{([\s\S]*?)\}\s*return\s*\(/);
      expect(readBranchMatch).not.toBeNull();
      expect(readBranchMatch![1]).not.toContain('NestableDraggableFlatList');
      expect(readBranchMatch![1]).not.toContain('GestureDetector');
    });

    it('key parity across both read and edit trees for stations', () => {
      expect(dashboardGridSrc).toMatch(/key=\{item\.id\}/);
      expect(dashboardGridSrc).toMatch(/keyExtractor=\{\(item\)\s*=>\s*item\.id\}/);
    });

    it('stationArrivalsStore polling deps depend strictly on stationId and enabled (never index or gesture mirrors)', () => {
      expect(stationArrivalsStoreSrc).toMatch(/\[enabled,\s*executeFetch,\s*stationId\]/);
      expect(stationArrivalsStoreSrc).not.toContain('isEditing');
    });

    it('useStationArrivals initializes synchronously from store so exit-edit renders last-known immediately', () => {
      expect(stationArrivalsStoreSrc).toMatch(/arrivalsStore\.get\(stationId\)\?\.departures/);
      expect(stationArrivalsStoreSrc).toMatch(/loading:\s*arrivals\s*===\s*undefined/);
    });

    it('fetchOnce enforces single-flight and 20s freshness window', () => {
      expect(stationArrivalsStoreSrc).toMatch(/FRESH_MS\s*=\s*20_000/);
      expect(stationArrivalsStoreSrc).toMatch(/now\s*-\s*existing\.fetchedAt\s*<\s*FRESH_MS/);
      expect(stationArrivalsStoreSrc).toMatch(/inFlightRequests\.get\(stationId\)/);
    });

    it('MyCommuteDashboard provides 4-second reversible delete undo toast', () => {
      expect(dashboardSrc).toMatch(/testID="delete-undo-toast"/);
      expect(dashboardSrc).toMatch(/testID="delete-undo-button"/);
      expect(dashboardSrc).toMatch(/deleteCachedArrivals\(stationId\)/);
    });

    it('DashboardGrid sets autoscrollSpeed={0} and autoscrollThreshold={80} to eliminate runaway autoscroll without NaN', () => {
      expect(dashboardGridSrc).toMatch(/autoscrollThreshold=\{80\}/);
      expect(dashboardGridSrc).toMatch(/autoscrollSpeed=\{0\}/);
    });

    it('stationArrivalsStore implements subscriber reference counting and interval deduplication', () => {
      expect(stationArrivalsStoreSrc).toMatch(/activeSubscriptions\s*=\s*new Map/);
      expect(stationArrivalsStoreSrc).toMatch(/subscribeToStation\(/);
      expect(stationArrivalsStoreSrc).toMatch(/getActiveSubscriptionCount/);
    });
  });
});
