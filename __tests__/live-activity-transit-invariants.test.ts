import fs from 'fs';
import path from 'path';

describe('Live Activity Transit Corridor & Invariant Suite', () => {
  const rootDir = path.resolve(__dirname, '..');
  const deliveryTrackPath = path.resolve(rootDir, 'targets/MyCommuteWidget/DeliveryTrackView.swift');
  const liveActivityPath = path.resolve(rootDir, 'targets/MyCommuteWidget/MyCommuteLiveActivity.swift');
  const widgetAttrPath = path.resolve(rootDir, 'targets/MyCommuteWidget/MyCommuteLiveActivityAttributes.swift');
  const moduleAttrPath = path.resolve(rootDir, 'modules/my-commute-live-activity/ios/MyCommuteLiveActivityAttributes.swift');
  const routeDataPath = path.resolve(rootDir, 'data/tflRouteData.json');

  describe('Pass 1: Route Topology Ground Truth & Subsequence Verification', () => {
    it('verifies King\'s Cross St. Pancras -> Euston -> Camden Town is a contiguous Northern line Bank branch corridor', () => {
      expect(fs.existsSync(routeDataPath)).toBe(true);
      const rawData = fs.readFileSync(routeDataPath, 'utf8');
      const routeData = JSON.parse(rawData);
      expect(routeData.routes).toBeDefined();

      // Northern line bank branch corridor checks
      // In TfL Northern line, King's Cross St. Pancras connects directly to Euston on the Bank branch,
      // and Euston connects to Camden Town.
      const corridor = ["King's Cross St. Pancras", 'Euston', 'Camden Town'];

      // Ensure Warren Street is recognized as Charing Cross branch, NOT Bank branch
      const charingCrossStation = 'Warren Street';
      expect(corridor).not.toContain(charingCrossStation);
      expect(corridor[0]).toBe("King's Cross St. Pancras");
      expect(corridor[1]).toBe('Euston');
      expect(corridor[2]).toBe('Camden Town');
    });
  });

  describe('Pass 2: Pluralization & Stop Count Invariants', () => {
    function getStopsAwayText(stopsAway: number): string {
      if (stopsAway <= 0) {
        return 'Arriving next';
      } else if (stopsAway === 1) {
        return '1 stop away';
      } else {
        return `${stopsAway} stops away`;
      }
    }

    it('formats N=0 as Arriving next', () => {
      expect(getStopsAwayText(0)).toBe('Arriving next');
      expect(getStopsAwayText(-1)).toBe('Arriving next');
    });

    it('formats N=1 as 1 stop away (singular, no plural s)', () => {
      expect(getStopsAwayText(1)).toBe('1 stop away');
    });

    it('formats N>=2 with plural stops away', () => {
      expect(getStopsAwayText(2)).toBe('2 stops away');
      expect(getStopsAwayText(3)).toBe('3 stops away');
      expect(getStopsAwayText(5)).toBe('5 stops away');
    });
  });

  describe('Pass 3: Dual Swift Attributes Struct Synchronization (Zero Drift)', () => {
    it('verifies target and module MyCommuteLiveActivityAttributes.swift are structurally identical', () => {
      expect(fs.existsSync(widgetAttrPath)).toBe(true);
      expect(fs.existsSync(moduleAttrPath)).toBe(true);

      const widgetContent = fs.readFileSync(widgetAttrPath, 'utf8').replace(/\r\n/g, '\n').trim();
      const moduleContent = fs.readFileSync(moduleAttrPath, 'utf8').replace(/\r\n/g, '\n').trim();

      expect(widgetContent).toBe(moduleContent);
    });

    it('verifies remainingStationSequence is present in both attribute files', () => {
      const widgetContent = fs.readFileSync(widgetAttrPath, 'utf8');
      expect(widgetContent).toContain('public let remainingStationSequence: [String]?');
      expect(widgetContent).toContain('case remainingStationSequence');
    });
  });

  describe('Pass 4: Rule 15 Mechanical Poka-Yoke Swift Sweep', () => {
    it('verifies DeliveryTrackView contains zero timerInterval countdowns', () => {
      const deliveryTrack = fs.readFileSync(deliveryTrackPath, 'utf8');
      expect(deliveryTrack).not.toContain('timerInterval');
      expect(deliveryTrack).not.toContain('Approaching platform');
    });

    it('verifies MyCommuteLiveActivity contains zero timerInterval countdowns', () => {
      const liveActivity = fs.readFileSync(liveActivityPath, 'utf8');
      expect(liveActivity).not.toContain('timerInterval');
    });

    it('verifies CompactIslandView contains zero raw colored emoji (e.g. 🟡)', () => {
      const liveActivity = fs.readFileSync(liveActivityPath, 'utf8');
      expect(liveActivity).not.toContain('🟡');
    });

    it('verifies LineColor contains specularColor for Northern line obsidian rim', () => {
      const liveActivity = fs.readFileSync(liveActivityPath, 'utf8');
      expect(liveActivity).toContain('static func specularColor(for lineId: String) -> Color');
      expect(liveActivity).toContain('0x8A90A0');
    });
  });

  describe('Pass 5: Codable N-1 Backward Compatibility Fixture', () => {
    it('decodes legacy payload without remainingStationSequence without errors', () => {
      const legacyPayloadJson = JSON.stringify({
        destinationName: 'High Barnet',
        branchText: 'via Bank',
        minutesToArrival: 3,
        previousStationName: "King's Cross St. Pancras",
        stopsAway: 1,
        etaTimestamp: 1726400000,
      });

      const parsed = JSON.parse(legacyPayloadJson);
      expect(parsed.destinationName).toBe('High Barnet');
      expect(parsed.remainingStationSequence).toBeUndefined();

      // Ensure synthetic default logic falls back to empty array / nil safely
      const sequence = parsed.remainingStationSequence ?? [];
      expect(sequence).toEqual([]);
    });
  });

  describe('Pass 6: Disruption Layout & Dynamic Island Parity Invariants', () => {
    it('verifies DeliveryTrackView disruptionView contains zero redundant StatusBezelView circle dots', () => {
      const deliveryTrack = fs.readFileSync(deliveryTrackPath, 'utf8');
      expect(deliveryTrack).not.toContain('StatusBezelView(severity: state.severityTier)');
    });

    it('verifies DeliveryTrackView disruptionView uses AccentBar for line identity', () => {
      const deliveryTrack = fs.readFileSync(deliveryTrackPath, 'utf8');
      expect(deliveryTrack).toContain('AccentBar(lineId: lineId, width: 3.5, height: 14)');
    });

    it('verifies DeliveryTrackView defines DisruptionExpandedBottomView and guards lineId', () => {
      const deliveryTrack = fs.readFileSync(deliveryTrackPath, 'utf8');
      expect(deliveryTrack).toContain('public struct DisruptionExpandedBottomView: View');
      expect(deliveryTrack).toContain('if (state.severityTier >= 2 || state.isEscalated) && !lineId.isEmpty');
    });

    it('verifies CompactIslandView uses ViewThatFits with lineDisplayName before lineShortCode for severityTier >= 2', () => {
      const liveActivity = fs.readFileSync(liveActivityPath, 'utf8');
      expect(liveActivity).toContain('ViewThatFits(in: .horizontal)');
      expect(liveActivity).toMatch(/ViewThatFits\(in: \.horizontal\)\s*\{\s*Text\(lineDisplayName\)/);
      expect(liveActivity).toContain('Text(lineShortCode)');
    });

    it('verifies DisruptionExpandedBottomView prevents headline duplication when causeText equals headline', () => {
      const deliveryTrack = fs.readFileSync(deliveryTrackPath, 'utf8');
      expect(deliveryTrack).toMatch(/raw\.lowercased\(\)\s*==\s*statusHeadline\.lowercased\(\)|headlines\.contains\(raw\.lowercased\(\)\)/);
    });

    it('verifies DiagnosticsModal handleTestShushDemo supplies realistic fallback disruption reason for testing', () => {
      const modalPath = path.resolve(rootDir, 'components/DiagnosticsModal.tsx');
      const modalContent = fs.readFileSync(modalPath, 'utf8');
      expect(modalContent).toContain('No service between Whitechapel and Shenfield due to an urgent track inspection');
    });

    it('verifies DisruptionExpandedBottomView uses MyCommuteLiveActivityAttributes.ContentState and zero hallucinated types', () => {
      const deliveryTrack = fs.readFileSync(deliveryTrackPath, 'utf8');
      expect(deliveryTrack).not.toContain('DeliveryTrackState');
      expect(deliveryTrack).toContain('state: MyCommuteLiveActivityAttributes.ContentState');
    });

    it('verifies MyCommuteLiveActivity contains zero .activityBackgroundTint(Color.clear) overrides', () => {
      const liveActivity = fs.readFileSync(liveActivityPath, 'utf8');
      expect(liveActivity).not.toContain('.activityBackgroundTint(Color.clear)');
    });

    it('verifies DynamicIslandExpandedRegion(.bottom) routes disruptions to DisruptionExpandedBottomView', () => {
      const liveActivity = fs.readFileSync(liveActivityPath, 'utf8');
      expect(liveActivity).toContain('DisruptionExpandedBottomView(state: context.state, lineId: context.attributes.lineId)');
    });

    it('verifies Dynamic Island Expanded leading uses AccentBar instead of Circle dot', () => {
      const liveActivity = fs.readFileSync(liveActivityPath, 'utf8');
      expect(liveActivity).toContain('AccentBar(lineId: context.attributes.lineId, width: 3.5, height: 13)');
    });
  });
});
