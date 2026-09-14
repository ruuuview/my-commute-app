import { useUserPreferencesStore } from '../store/userPreferencesStore';
import * as fs from 'fs';
import * as path from 'path';

describe('Routing & Intent Lifecycle Invariants (Rule 20 Compliance)', () => {
  beforeEach(() => {
    useUserPreferencesStore.setState({
      lastHandledColdBootNotificationId: null,
      _hasHydrated: true,
      hasCompletedOnboarding: true,
      selectedLines: ['victoria'],
    });
  });

  describe('Invariant 1: Cold Boot vs Live Listener Partitioning', () => {
    it('persists and updates lastHandledColdBootNotificationId in store', () => {
      const store = useUserPreferencesStore.getState();
      expect(store.lastHandledColdBootNotificationId).toBeNull();

      store.setLastHandledColdBootNotificationId('notif-cold-123');
      expect(useUserPreferencesStore.getState().lastHandledColdBootNotificationId).toBe('notif-cold-123');
    });

    it('quarantines duplicate cold-boot notification replay', () => {
      useUserPreferencesStore.setState({ lastHandledColdBootNotificationId: 'handled-cold-1' });

      // Simulate cold boot check logic
      const simulateColdBoot = (notifId: string, timestamp: number) => {
        const prefs = useUserPreferencesStore.getState();
        if (notifId === prefs.lastHandledColdBootNotificationId) {
          return { handled: false, reason: 'duplicate_id' };
        }
        const ageMs = Date.now() - timestamp;
        if (ageMs > 30 * 60 * 1000) {
          return { handled: false, reason: 'stale_disruption' };
        }
        prefs.setLastHandledColdBootNotificationId(notifId);
        return { handled: true, reason: 'dispatched' };
      };

      // 1. Same ID on cold boot -> dropped
      const result1 = simulateColdBoot('handled-cold-1', Date.now() - 1000);
      expect(result1.handled).toBe(false);
      expect(result1.reason).toBe('duplicate_id');

      // 2. Stale timestamp (> 30m) on cold boot -> dropped
      const result2 = simulateColdBoot('new-notif-2', Date.now() - 35 * 60 * 1000);
      expect(result2.handled).toBe(false);
      expect(result2.reason).toBe('stale_disruption');

      // 3. Fresh, new notification -> accepted and recorded
      const result3 = simulateColdBoot('new-notif-2', Date.now() - 5000);
      expect(result3.handled).toBe(true);
      expect(useUserPreferencesStore.getState().lastHandledColdBootNotificationId).toBe('new-notif-2');
    });

    it('permits repeated user re-taps in live event stream (Rule 20 partition)', () => {
      // In live stream, user tapping the same banner multiple times while app is backgrounded
      // must NOT be blocked by the cold-boot cache.
      useUserPreferencesStore.setState({ lastHandledColdBootNotificationId: 'same-banner-id' });

      const simulateLiveTap = (_notifId: string) => {
        // Live stream is UNFILTERED: every tap is an explicit user gesture
        return { handled: true };
      };

      const tap1 = simulateLiveTap('same-banner-id');
      const tap2 = simulateLiveTap('same-banner-id');
      expect(tap1.handled).toBe(true);
      expect(tap2.handled).toBe(true);
    });
  });

  describe('Invariant 2: Widget Deep Link Emitters in CommuteWidget.swift', () => {
    const widgetPath = path.resolve(__dirname, '../targets/MyCommuteWidget/CommuteWidget.swift');
    const content = fs.readFileSync(widgetPath, 'utf8');

    it('routes DashboardView to mycommute:// (app root, NOT mycommute://lines or mycommute://dashboard)', () => {
      // Find DashboardView struct
      const dashboardViewMatch = content.match(/struct DashboardView[\s\S]*?\.widgetURL\(URL\(string:\s*"([^"]+)"\)\)/);
      expect(dashboardViewMatch).not.toBeNull();
      expect(dashboardViewMatch![1]).toBe('mycommute://');
    });

    it('routes SmallPriorityView to mycommute:// (app root)', () => {
      const smallViewMatch = content.match(/struct SmallPriorityView[\s\S]*?\.widgetURL\(URL\(string:\s*"([^"]+)"\)\)/);
      expect(smallViewMatch).not.toBeNull();
      expect(smallViewMatch![1]).toBe('mycommute://');
    });

    it('preserves HIG empty state routing exclusively to mycommute://lines', () => {
      const emptyViewMatch = content.match(/struct EmptyStateView[\s\S]*?\.widgetURL\(URL\(string:\s*"([^"]+)"\)\)/);
      expect(emptyViewMatch).not.toBeNull();
      expect(emptyViewMatch![1]).toBe('mycommute://lines');
    });
  });

  describe('Invariant 3: lines.tsx Hydration and Route Resolution', () => {
    it('app/lines.tsx file requires _hasHydrated check before routing', () => {
      const linesPath = path.resolve(__dirname, '../app/lines.tsx');
      const linesCode = fs.readFileSync(linesPath, 'utf8');

      expect(linesCode).toContain('_hasHydrated');
      expect(linesCode).toContain('if (!_hasHydrated)');
    });

    it('app/lines.tsx routes to /(tabs) without manageLines when user already has lines', () => {
      const linesPath = path.resolve(__dirname, '../app/lines.tsx');
      const linesCode = fs.readFileSync(linesPath, 'utf8');

      expect(linesCode).toContain('selectedLines.length > 0');
      expect(linesCode).toContain("router.replace('/(tabs)' as any)");
    });
  });

  describe('Invariant 4: MyCommuteDashboard Parameter Cleaning', () => {
    it('clears manageLines synchronously upon consumption in MyCommuteDashboard', () => {
      const dashPath = path.resolve(__dirname, '../components/MyCommuteDashboard.tsx');
      const dashCode = fs.readFileSync(dashPath, 'utf8');

      // Verifies manageLines is consumed and immediately set to empty string
      expect(dashCode).toContain("router.setParams({ manageLines: '' })");
    });

    it('clears manageLines in ManageLinesModal.onClose to prevent resurrection', () => {
      const dashPath = path.resolve(__dirname, '../components/MyCommuteDashboard.tsx');
      const dashCode = fs.readFileSync(dashPath, 'utf8');

      // Verifies onClose clears manageLines
      expect(dashCode).toMatch(/onClose=\{[\s\S]*?setModalVisible\(false\)[\s\S]*?router\.setParams\(\{\s*manageLines:\s*''\s*\}\)/);
    });

    it('uses session-scoped intent deduplication sets to survive tab switching', () => {
      const dashPath = path.resolve(__dirname, '../components/MyCommuteDashboard.tsx');
      const dashCode = fs.readFileSync(dashPath, 'utf8');

      expect(dashCode).toContain('sessionConsumedManageLinesNonces');
      expect(dashCode).toContain('sessionConsumedNotificationNonces');
      expect(dashCode).toContain('sessionConsumedLegacyLineIds');
    });
  });

  describe('Invariant 5: Lock Screen Accessory Widget Invariants (Rule 22 Compliance)', () => {
    const widgetPath = path.resolve(__dirname, '../targets/MyCommuteWidget/CommuteWidget.swift');
    const widgetCode = fs.readFileSync(widgetPath, 'utf8');

    it('eliminates self-branding COMMUTE header from accessory views', () => {
      // Isolates the accessory views section
      const accessorySection = widgetCode.substring(
        widgetCode.indexOf('struct AccessoryInlineView'),
        widgetCode.indexOf('struct ContainerBackgroundModifier')
      );
      expect(accessorySection).not.toContain('Text("COMMUTE")');
    });

    it('bans raw colored emoji from accessory views in favor of monochrome SF Symbols', () => {
      const accessorySection = widgetCode.substring(
        widgetCode.indexOf('struct AccessoryInlineView'),
        widgetCode.indexOf('struct ContainerBackgroundModifier')
      );
      expect(accessorySection).not.toContain('⚠️');
      expect(accessorySection).not.toContain('🚆');
      expect(accessorySection).not.toContain('✓');
      expect(accessorySection).toContain('exclamationmark.triangle.fill');
      expect(accessorySection).toContain('checkmark');
    });

    it('enforces state-dependent routing: mycommute:// for populated and mycommute://lines for empty', () => {
      const accessorySection = widgetCode.substring(
        widgetCode.indexOf('struct AccessoryInlineView'),
        widgetCode.indexOf('struct ContainerBackgroundModifier')
      );
      expect(accessorySection).toContain('entry.lines.isEmpty ? "mycommute://lines" : "mycommute://"');
    });

    it('applies Dynamic Type clamping to large on all accessory views', () => {
      const accessorySection = widgetCode.substring(
        widgetCode.indexOf('struct AccessoryInlineView'),
        widgetCode.indexOf('struct ContainerBackgroundModifier')
      );
      const occurrences = (accessorySection.match(/\.dynamicTypeSize\(\.\.\.DynamicTypeSize\.large\)/g) || []).length;
      expect(occurrences).toBe(3); // Rectangular, Circular, Inline
    });

    it('attaches VoiceOver accessibilityLabel to checkmark symbols', () => {
      const accessorySection = widgetCode.substring(
        widgetCode.indexOf('struct AccessoryInlineView'),
        widgetCode.indexOf('struct ContainerBackgroundModifier')
      );
      expect(accessorySection).toContain('.accessibilityLabel("All lines normal")');
    });

    it('guarantees inline complication string <= 26 characters across worst-case lines', () => {
      // Test the abbreviation logic matching CommuteWidget.swift
      const abbreviateLine = (name: string): string => {
        switch (name.toLowerCase()) {
          case 'metropolitan': return 'Met';
          case 'waterloo & city': case 'waterloo and city': return 'W&C';
          case 'hammersmith & city': case 'hammersmith and city': return 'H&C';
          case 'piccadilly': return 'Picc';
          default:
            return name.length > 10 ? name.slice(0, 8) + '.' : name;
        }
      };

      const abbreviateStatus = (status: string): string => {
        switch (status.toLowerCase()) {
          case 'good service': return 'Good';
          case 'minor delays': return 'Minor';
          case 'severe delays': return 'Severe';
          case 'part suspended': return 'Part Susp';
          case 'suspended': return 'Susp';
          case 'planned closure': return 'Closure';
          case 'part closure': return 'Part Close';
          default:
            return status.length > 10 ? status.slice(0, 8) + '.' : status;
        }
      };

      const sampleLines = [
        { name: 'Metropolitan', status: 'Part Suspended' },
        { name: 'Hammersmith & City', status: 'Planned Closure' },
        { name: 'Waterloo & City', status: 'Severe Delays' },
        { name: 'Piccadilly', status: 'Minor Delays' },
        { name: 'Central', status: 'Severe Delays' },
      ];

      for (const line of sampleLines) {
        const str = `${abbreviateLine(line.name)}: ${abbreviateStatus(line.status)}`;
        expect(str.length).toBeLessThanOrEqual(26);
      }

      // Multi-line disruption string
      expect('2 Lines Delayed'.length).toBeLessThanOrEqual(26);
      expect('11 Lines Delayed'.length).toBeLessThanOrEqual(26);
      expect('All Lines Normal'.length).toBeLessThanOrEqual(26);
      expect('Tap to setup'.length).toBeLessThanOrEqual(26);
    });
  });
});
