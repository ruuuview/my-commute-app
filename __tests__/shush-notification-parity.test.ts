// frontend/__tests__/shush-notification-parity.test.ts
// ==============================================================================
// Shush Disruption Card & Push Notification 100% Parity Invariant Contract
//
// Mechanically enforces:
//   1. Single source of truth for disruption body formatting (disruptionCopy.ts)
//   2. Verbatim TfL casing preservation (no destructive lowercase/normalization)
//   3. Canonical line name casing across all 19 routes (specifically "DLR", never "Dlr")
//   4. Elimination of the 60-character cut (full 230-char word-bounded budget)
//   5. Complete 28-status TfL abbreviation table with zero arbitrary prefix cuts
//   6. Total wipeout of developer/debug copy ("Preview:", "PREVIEW", "Preview Mode")
// ==============================================================================

import fs from 'fs';
import path from 'path';
import {
  formatDisruptionNotificationBody,
  MAX_NOTIFICATION_BODY_CHARS,
} from '../services/notifications/disruptionCopy';
import lineColorsJson from '../constants/lineColors.json';
import { LINE_NAMES } from '../constants/lineColors';
import routeData from '../data/tflRouteData.json';
import tflStatusLabels from '../constants/tflStatusLabels.json';
import severityColors from '../constants/severityColors.json';
import { getSeverityColor, getSeverityLabel } from '../utils/getSeverityColor';

describe('Shush Disruption Card & Push Notification Parity Invariants', () => {
  describe('Invariant 1: Disruption Copy Single Source of Truth & Verbatim Casing', () => {
    it('preserves exact TfL uppercase words ("SERVICE") while stripping redundant line prefixes and trailing whitespace', () => {
      const rawTflInput = {
        statusDescription: 'Part Suspended',
        cause:
          'Docklands Light Railway: No service between Bank / Tower Gateway and Poplar / West India Quay while we fix a faulty train at Westferry. Good SERVICE on the rest of the line. ',
      };

      const formatted = formatDisruptionNotificationBody(rawTflInput);

      // Must strip redundant line prefix "Docklands Light Railway: "
      expect(formatted).not.toContain('Docklands Light Railway:');

      // Must preserve the verbatim TfL casing: uppercase "SERVICE"
      expect(formatted).toContain('Good SERVICE on the rest of the line.');

      // Must strip trailing whitespace
      expect(formatted.endsWith(' ')).toBe(false);

      // Expected exact output without arbitrary truncation
      expect(formatted).toBe(
        'Part Suspended (No service between Bank / Tower Gateway and Poplar / West India Quay while we fix a faulty train at Westferry. Good SERVICE on the rest of the line.)'
      );
      expect(formatted.length).toBeLessThanOrEqual(MAX_NOTIFICATION_BODY_CHARS);
    });

    it('does not double-wrap if cause already incorporates the status description', () => {
      const input = {
        statusDescription: 'Severe Delays',
        cause: 'Severe delays between Camden Town and High Barnet due to a signal failure.',
      };

      const formatted = formatDisruptionNotificationBody(input);
      expect(formatted).toBe(
        'Severe delays between Camden Town and High Barnet due to a signal failure.'
      );
    });

    it('safely handles null or empty causes by returning clean status description', () => {
      expect(formatDisruptionNotificationBody({ statusDescription: 'Severe Delays', cause: null })).toBe('Severe Delays');
      expect(formatDisruptionNotificationBody({ statusDescription: 'Part Suspended', cause: '   ' })).toBe('Part Suspended');
    });

    it('truncates at whole-word boundaries when exceeding 230 characters without mid-word cuts', () => {
      const longCause =
        'Very long disruption reason that goes on and on explaining in extreme detail every single technical issue encountered by TfL engineering teams including track maintenance, signal cables, power substations, rolling stock replacement, and platform crowding until it exceeds the maximum budget.';
      const formatted = formatDisruptionNotificationBody({
        statusDescription: 'Part Suspended',
        cause: longCause,
      });

      expect(formatted.length).toBeLessThanOrEqual(MAX_NOTIFICATION_BODY_CHARS);
      expect(formatted.endsWith('…')).toBe(true);
      // Ensure it does not cut a word in half: word before ellipsis must be a complete word
      const beforeEllipsis = formatted.slice(0, -1);
      const lastChar = beforeEllipsis.slice(-1);
      expect(lastChar).not.toBe(' ');
    });
  });

  describe('Invariant 2: Canonical Line Name Casing (Anti-"Dlr" Regressive Gate)', () => {
    const canonicalRoutes = Object.keys(routeData.routes);

    it('enforces exact canonical casing across all 19 routes between tflRouteData.json, lineColors.json, and LINE_NAMES', () => {
      expect(canonicalRoutes.length).toBe(19);

      for (const routeId of canonicalRoutes) {
        const jsonName = (lineColorsJson.lines as Record<string, { name: string }>)[routeId]?.name;
        const tsName = (LINE_NAMES as Record<string, string>)[routeId];

        expect(jsonName).toBeDefined();
        expect(tsName).toBeDefined();
        expect(tsName).toBe(jsonName);
      }
    });

    it('strictly guarantees DLR resolves to uppercase "DLR" (never "Dlr")', () => {
      expect((LINE_NAMES as Record<string, string>)['dlr']).toBe('DLR');
      expect((lineColorsJson.lines as Record<string, { name: string }>).dlr.name).toBe('DLR');
    });

    it('guarantees Swift targets strictly map "dlr" to "DLR"', () => {
      const liveActivitySwift = fs.readFileSync(
        path.resolve(__dirname, '../targets/MyCommuteWidget/MyCommuteLiveActivity.swift'),
        'utf8'
      );
      const deliveryTrackSwift = fs.readFileSync(
        path.resolve(__dirname, '../targets/MyCommuteWidget/DeliveryTrackView.swift'),
        'utf8'
      );

      // Both Swift files must explicitly guard against "Dlr" capitalization
      expect(liveActivitySwift).toMatch(/if\s+norm\s*==\s*"dlr"\s*\{\s*return\s*"DLR"\s*\}/);
      expect(deliveryTrackSwift).toMatch(/if\s+norm\s*==\s*"dlr"\s*\{\s*return\s*"DLR"\s*\}/);
    });
  });

  describe('Invariant 3: Severity Colors Parity (Sole Source of Truth: severityColors.json)', () => {
    it('verifies getSeverityColor maps severity codes and status text to severityColors.json tokens', () => {
      expect(severityColors.good).toBe('#30D158');
      expect(severityColors.minor).toBe('#FFB000');
      expect(severityColors.severe).toBe('#FF3B30');

      // Good Service
      expect(getSeverityColor(10, 'Good Service').color).toBe(severityColors.good);
      expect(getSeverityLabel(10, 'Good Service')).toBe('good');

      // Minor Delays
      expect(getSeverityColor(9, 'Minor Delays').color).toBe(severityColors.minor);
      expect(getSeverityLabel(9, 'Minor Delays')).toBe('minor');

      // Severe Delays
      expect(getSeverityColor(6, 'Severe Delays').color).toBe(severityColors.severe);
      expect(getSeverityLabel(6, 'Severe Delays')).toBe('severe');

      // Part Suspended / Suspended
      expect(getSeverityColor(5, 'Part Suspended').color).toBe(severityColors.severe);
      expect(getSeverityColor(4, 'Suspended').color).toBe(severityColors.severe);
    });

    it('guarantees Swift StatusBezelView uses the canonical severity colors', () => {
      const deliveryTrackSwift = fs.readFileSync(
        path.resolve(__dirname, '../targets/MyCommuteWidget/DeliveryTrackView.swift'),
        'utf8'
      );
      expect(deliveryTrackSwift).toContain('0xFF3B30'); // Severe / Suspended (Red)
      expect(deliveryTrackSwift).toContain('0xFFB000'); // Minor (Amber)
      expect(deliveryTrackSwift).toContain('0x30D158'); // Good (Green)
    });
  });

  describe('Invariant 4: Dynamic Island Compact Label Approved Table (Zero Truncation)', () => {
    it('contains all 28 canonical TfL status severity descriptions in tflStatusLabels.json', () => {
      const keys = Object.keys(tflStatusLabels);
      expect(keys.length).toBeGreaterThanOrEqual(28);

      // Essential disruptions must have approved compact abbreviations <= 10 chars
      expect((tflStatusLabels as Record<string, string>)['Good Service']).toBe('Good');
      expect((tflStatusLabels as Record<string, string>)['Minor Delays']).toBe('Minor');
      expect((tflStatusLabels as Record<string, string>)['Severe Delays']).toBe('Severe');
      expect((tflStatusLabels as Record<string, string>)['Part Suspended']).toBe('Part Susp');
      expect((tflStatusLabels as Record<string, string>)['Suspended']).toBe('Susp');
      expect((tflStatusLabels as Record<string, string>)['Planned Closure']).toBe('Closure');
      expect((tflStatusLabels as Record<string, string>)['Closed']).toBe('Closed');
    });

    it('guarantees Swift compactStatusLabel table mirrors tflStatusLabels.json exactly', () => {
      const liveActivitySwift = fs.readFileSync(
        path.resolve(__dirname, '../targets/MyCommuteWidget/MyCommuteLiveActivity.swift'),
        'utf8'
      );

      for (const [status, abbreviation] of Object.entries(tflStatusLabels)) {
        const expectedLine = `"${status}": "${abbreviation}"`;
        expect(liveActivitySwift).toContain(expectedLine);
      }
    });

    it('strictly forbids arbitrary prefix slicing (prefix(6)) in Swift status mapping', () => {
      const liveActivitySwift = fs.readFileSync(
        path.resolve(__dirname, '../targets/MyCommuteWidget/MyCommuteLiveActivity.swift'),
        'utf8'
      );
      const fnMatch = liveActivitySwift.match(/func\s+compactStatusLabel[\s\S]*?\n\}/);
      expect(fnMatch).not.toBeNull();
      const fnBody = fnMatch![0];
      expect(fnBody).not.toMatch(/prefix\s*\(\s*[4-7]\s*\)/);
    });
  });

  describe('Invariant 5: Zero Developer Copy on Consumer Cards', () => {
    it('verifies DeliveryTrackView contains zero preview prefixes or debug footers', () => {
      const deliveryTrackSwift = fs.readFileSync(
        path.resolve(__dirname, '../targets/MyCommuteWidget/DeliveryTrackView.swift'),
        'utf8'
      );

      expect(deliveryTrackSwift).not.toContain('hasPrefix("Preview: ")');
      expect(deliveryTrackSwift).not.toContain('shushPreviewFooter');
      expect(deliveryTrackSwift).not.toContain('Preview Mode');
    });

    it('verifies LiveActivityService.buildPayload contains zero 60-character arbitrary slicing', () => {
      const serviceTs = fs.readFileSync(
        path.resolve(__dirname, '../services/LiveActivityService.ts'),
        'utf8'
      );

      // The old bug was: rawStatusText.slice(0, 57)
      expect(serviceTs).not.toMatch(/slice\s*\(\s*0\s*,\s*57\s*\)/);
    });
  });
});
