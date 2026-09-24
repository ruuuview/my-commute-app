import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import * as fs from 'fs';
import * as path from 'path';
import * as Haptics from 'expo-haptics';
import { SegmentedGlassControl } from '../components/SegmentedGlassControl';
import { LiquidGlassView, GlassSurface } from '../components/LiquidGlassView';
import { LineCard } from '../components/LineCard';
import * as useReducedMotionModule from '../hooks/useReducedMotion';
import * as useReduceTransparencyModule from '../hooks/useReduceTransparency';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
}));

describe('Accessibility & Universal Compliance Invariants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('SegmentedGlassControl VoiceOver & Semantic Invariants', () => {
    test('Renders radiogroup container with exact VoiceOver child semantics', async () => {
      jest.spyOn(useReducedMotionModule, 'useLiveReducedMotion').mockReturnValue(false);

      const onSelect = jest.fn();
      const { getByLabelText, getAllByRole } = await render(
        <SegmentedGlassControl
          currentMode="loud"
          onSelectMode={onSelect}
          hapticsEnabled={true}
        />
      );

      // Parent container must have radiogroup role
      const radiogroup = getByLabelText('Notification delivery mode');
      expect(radiogroup.props.accessibilityRole).toBe('radiogroup');

      // 3 items with radio role
      const radios = getAllByRole('radio');
      expect(radios).toHaveLength(3);

      // Check exact announcement labels and selected states
      expect(radios[0].props.accessibilityLabel).toBe('Standard, 1 of 3');
      expect(radios[0].props.accessibilityState).toEqual({ selected: true });

      expect(radios[1].props.accessibilityLabel).toBe('Ambient, 2 of 3');
      expect(radios[1].props.accessibilityState).toEqual({ selected: false });

      expect(radios[2].props.accessibilityLabel).toBe('Muted, 3 of 3');
      expect(radios[2].props.accessibilityState).toEqual({ selected: false });
    });

    test('Reduce Motion gating: suppresses haptic impact when reduceMotion is enabled', async () => {
      jest.spyOn(useReducedMotionModule, 'useLiveReducedMotion').mockReturnValue(true);

      const onSelect = jest.fn();
      const { getAllByRole } = await render(
        <SegmentedGlassControl
          currentMode="loud"
          onSelectMode={onSelect}
          hapticsEnabled={true}
        />
      );

      const radios = getAllByRole('radio');
      fireEvent.press(radios[1]); // tap Ambient

      expect(onSelect).toHaveBeenCalledWith('shush');
      // Haptics MUST be suppressed under reduceMotion
      expect(Haptics.impactAsync).not.toHaveBeenCalled();
    });

    test('Triggers haptic impact when reduceMotion is false and hapticsEnabled is true', async () => {
      jest.spyOn(useReducedMotionModule, 'useLiveReducedMotion').mockReturnValue(false);

      const onSelect = jest.fn();
      const { getAllByRole } = await render(
        <SegmentedGlassControl
          currentMode="loud"
          onSelectMode={onSelect}
          hapticsEnabled={true}
        />
      );

      const radios = getAllByRole('radio');
      fireEvent.press(radios[1]);

      expect(onSelect).toHaveBeenCalledWith('shush');
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    });
  });

  describe('WCAG AAA Contrast Ratio Mathematical Invariants', () => {
    // Relative Luminance calculation per WCAG 2.1 (sRGB linearization)
    function getLuminance(r: number, g: number, b: number): number {
      const a = [r, g, b].map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
    }

    function getContrastRatio(lum1: number, lum2: number): number {
      const brightest = Math.max(lum1, lum2);
      const darkest = Math.min(lum1, lum2);
      return (brightest + 0.05) / (darkest + 0.05);
    }

    test('White text (#FFFFFF) on tinted/dark backdrops exceeds WCAG AAA (7.0:1)', () => {
      const whiteLum = getLuminance(255, 255, 255); // 1.0

      // London Night canvas: #070714
      const canvasLum = getLuminance(7, 7, 20); // ~0.0012
      const canvasContrast = getContrastRatio(whiteLum, canvasLum);
      expect(canvasContrast).toBeGreaterThan(17.0); // 17.5:1, well above 7.0:1 AAA

      // Active Blue card (16% #0A84FF over #070714): ~rgb(15, 27, 57)
      const activeBlueLum = getLuminance(15, 27, 57);
      const blueContrast = getContrastRatio(whiteLum, activeBlueLum);
      expect(blueContrast).toBeGreaterThan(15.0);

      // Inactive text (70% opacity white over #070714): ~rgb(180, 180, 185)
      const inactiveTextLum = getLuminance(180, 180, 185);
      const inactiveContrast = getContrastRatio(inactiveTextLum, canvasLum);
      expect(inactiveContrast).toBeGreaterThan(7.0); // Exceeds WCAG AAA 7.0:1

      // Inactive icon (45% opacity white over #070714): ~rgb(118, 118, 126)
      const inactiveIconLum = getLuminance(118, 118, 126);
      const iconContrast = getContrastRatio(inactiveIconLum, canvasLum);
      expect(iconContrast).toBeGreaterThan(3.0); // Exceeds WCAG 3.0:1 non-text contrast
    });
  });

  describe('LiquidGlassView / GlassSurface Reduce Transparency Invariants', () => {
    test('Renders solid #1C1C1E and omits BlurView when Reduce Transparency is ON', async () => {
      jest.spyOn(useReduceTransparencyModule, 'useReduceTransparency').mockReturnValue(true);

      const screen = await render(
        <LiquidGlassView testID="test-glass">
          <></>
        </LiquidGlassView>
      );

      const tree = JSON.stringify(screen.toJSON());
      expect(tree).not.toContain('BlurView');
      expect(tree).toContain('#1C1C1E');
    });

    test('GlassSurface is exported as authoritative alias of LiquidGlassView', () => {
      expect(GlassSurface).toBe(LiquidGlassView);
    });
  });

  describe('Catch B: BlurView Allowlist Gate (No Unaudited Direct BlurViews)', () => {
    const APPROVED_BLUR_FILES = new Set([
      'LiquidGlassView.tsx',
      'FractalGlassTabBar.tsx',
      'DepartureCard.tsx',
      'MyCommuteDashboard.tsx',
      'LineCard.tsx',
      'ManageLinesModal.tsx',
      'FixItSheet.tsx',
      'PermissionPrimerModal.tsx',
      'PermissionExplainerModal.tsx',
      'StationCard.tsx',
      'StationDetailScreen.tsx',
      'DashboardSkeleton.tsx',
      'ManageStationsModal.tsx',
      'DiagnosticsModal.tsx',
      'AlertHoursSheet.tsx',
      'RerouteScreen.tsx',
      'ConfirmationCard.tsx',
      'ActiveClaimHeroCard.tsx',
      'ClaimHistoryDrawer.tsx',
      'LifetimeMetricsCard.tsx',
      'SafariClaimAssistant.tsx',
      'SlaSurveyModal.tsx',
      'TfLConnectSheet.tsx',
      'ZeroStateHeroCard.tsx',
    ]);

    test('Every component importing from expo-blur is present in the audited allowlist', () => {
      const componentsDir = path.resolve(__dirname, '../components');

      function scanDir(dir: string): string[] {
        const results: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            results.push(...scanDir(fullPath));
          } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes("from 'expo-blur'") || content.includes('from "expo-blur"')) {
              results.push(entry.name);
            }
          }
        }
        return results;
      }

      const filesWithBlur = scanDir(componentsDir);
      const unapproved = filesWithBlur.filter((file) => !APPROVED_BLUR_FILES.has(file));

      expect(unapproved).toEqual([]);
    });
  });

  describe('LineCard Inline Accordion Accessibility Invariants', () => {
    test('LineCard announces expanded state and hint correctly', async () => {
      const { getByRole, rerender } = await render(
        <LineCard
          line={{ id: 'victoria', name: 'Victoria', color: '#0098D4', status: 'Minor Delays', status_severity: 9 }}
          selected={false}
          statusType="minor"
          statusLabel="Minor Delays"
          mode="display"
          isExpanded={false}
        />
      );

      const button = getByRole('adjustable');
      expect(button.props.accessibilityState).toEqual({ expanded: false });
      expect(button.props.accessibilityHint).toBe('Double-tap to expand line details and alternative routes');

      await rerender(
        <LineCard
          line={{ id: 'victoria', name: 'Victoria', color: '#0098D4', status: 'Minor Delays', status_severity: 9, reason: 'Signal failure at Oxford Circus' }}
          selected={false}
          statusType="minor"
          statusLabel="Minor Delays"
          mode="display"
          isExpanded={true}
        />
      );

      const expandedButton = getByRole('adjustable');
      expect(expandedButton.props.accessibilityState).toEqual({ expanded: true });
      expect(expandedButton.props.accessibilityHint).toBe('Double-tap to collapse line details');
    });
  });
});
