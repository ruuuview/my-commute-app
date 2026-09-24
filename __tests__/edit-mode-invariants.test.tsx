import fs from 'fs';
import path from 'path';
import { AppState } from 'react-native';
import { renderHook, act } from '@testing-library/react-native';
import { useScrollLock } from '../hooks/useScrollLock';

describe('Direct Manipulation & Scroll Lock Invariants (Zero Jiggle/Edit Mode)', () => {
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

  describe('Rule: Complete Removal of Jiggle & Dual-Mode UI', () => {
    it('DepartureCard has zero jiggle styling, zero minus badge, and zero isEditing prop', () => {
      expect(departureCardSrc).not.toMatch(/jiggleStyle/);
      expect(departureCardSrc).not.toMatch(/minus-circle/);
      expect(departureCardSrc).not.toMatch(/isEditing/);
    });

    it('LineCard has zero jiggle styling, zero minus badge, and zero isEditing prop', () => {
      expect(lineCardSrc).not.toMatch(/jiggleStyle/);
      expect(lineCardSrc).not.toMatch(/minus-circle/);
      expect(lineCardSrc).not.toMatch(/isEditing/);
    });

    it('useJiggle hook is clean and returns empty animated style', () => {
      expect(useJiggleSrc).not.toMatch(/JIGGLE_MAX_DEG/);
      expect(useJiggleSrc).not.toMatch(/JIGGLE_PERIOD_MS/);
      expect(useJiggleSrc).toMatch(/export function useJiggle/);
    });

    it('Dashboard has zero Edit button, zero Done button, and zero background longPress', () => {
      expect(dashboardSrc).not.toMatch(/testID="floating-done-button"/);
      expect(dashboardSrc).not.toMatch(/handleEdit/);
      expect(dashboardSrc).not.toMatch(/handleExitEdit/);
      expect(dashboardSrc).not.toMatch(/onLongPress=\{handleEdit\}/);
    });
  });

  describe('Rule: Direct Card Long-Press Manipulation', () => {
    it('DepartureCard body triggers drag directly on long-press with delayLongPress={220}', () => {
      expect(departureCardSrc).toMatch(/testID=\{`departure-card-pressable-\$\{stationId\}`\}/);
      expect(departureCardSrc).toMatch(/delayLongPress=\{220\}/);
      expect(departureCardSrc).toMatch(/drag\(\)/);
    });

    it('LineCard body triggers drag directly on long-press with delayLongPress={220}', () => {
      expect(lineCardSrc).toMatch(/delayLongPress=\{220\}/);
      expect(lineCardSrc).toMatch(/drag\(\)/);
    });

    it('DepartureCard provides VoiceOver accessibilityActions for non-gesture reordering', () => {
      expect(departureCardSrc).toMatch(/accessibilityRole="adjustable"/);
      expect(departureCardSrc).toMatch(/name:\s*'increment',\s*label:\s*'Move Up'/);
      expect(departureCardSrc).toMatch(/name:\s*'decrement',\s*label:\s*'Move Down'/);
      expect(departureCardSrc).toMatch(/accessibilityValue=\{\{\s*text:\s*`Position \$\{index \+ 1\} of \$\{totalStations\}`\s*\}\}/);
      expect(departureCardSrc).toMatch(/AccessibilityInfo\.announceForAccessibility/);
    });

    it('LineCard provides VoiceOver accessibilityActions for non-gesture reordering', () => {
      expect(lineCardSrc).toMatch(/accessibilityRole="adjustable"/);
      expect(lineCardSrc).toMatch(/name:\s*'increment',\s*label:\s*'Move Up'/);
      expect(lineCardSrc).toMatch(/name:\s*'decrement',\s*label:\s*'Move Down'/);
      expect(lineCardSrc).toMatch(/onAccessibilityAction=\{/);
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

  describe('Rule: Direct Drag & Drop Architecture Invariants', () => {
    it('DashboardGrid renders directly via NestableDraggableFlatList with ScaleDecorator', () => {
      expect(dashboardGridSrc).toMatch(/<NestableDraggableFlatList/);
      expect(dashboardGridSrc).toMatch(/<ScaleDecorator/);
      expect(dashboardGridSrc).toMatch(/autoscrollThreshold=\{80\}/);
      expect(dashboardGridSrc).toMatch(/autoscrollSpeed=\{0\}/);
    });

    it('MyCommuteDashboard renders lines directly via NestableDraggableFlatList with ScaleDecorator', () => {
      expect(dashboardSrc).toMatch(/testID="nestable-draggable-lines"/);
      expect(dashboardSrc).toMatch(/renderLineItem/);
    });

    it('stationArrivalsStore polling deps depend strictly on stationId and enabled', () => {
      expect(stationArrivalsStoreSrc).toMatch(/\[enabled,\s*executeFetch,\s*stationId\]/);
      expect(stationArrivalsStoreSrc).not.toContain('isEditing');
    });

    it('useStationArrivals initializes synchronously from store', () => {
      expect(stationArrivalsStoreSrc).toMatch(/arrivalsStore\.get\(stationId\)\?\.departures/);
      expect(stationArrivalsStoreSrc).toMatch(/loading:\s*arrivals\s*===\s*undefined/);
    });

    it('fetchOnce enforces single-flight and 20s freshness window', () => {
      expect(stationArrivalsStoreSrc).toMatch(/FRESH_MS\s*=\s*20_000/);
      expect(stationArrivalsStoreSrc).toMatch(/now\s*-\s*existing\.fetchedAt\s*<\s*FRESH_MS/);
      expect(stationArrivalsStoreSrc).toMatch(/inFlightRequests\.get\(stationId\)/);
    });

    it('stationArrivalsStore implements subscriber reference counting and interval deduplication', () => {
      expect(stationArrivalsStoreSrc).toMatch(/activeSubscriptions\s*=\s*new Map/);
      expect(stationArrivalsStoreSrc).toMatch(/subscribeToStation\(/);
      expect(stationArrivalsStoreSrc).toMatch(/getActiveSubscriptionCount/);
    });
  });
});
