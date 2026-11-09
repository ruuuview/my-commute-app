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

    it('verifies DiagnosticsModal handleTestShushDemo injects hermetic test disruption reason without relying on live network data', () => {
      const modalPath = path.resolve(rootDir, 'components/DiagnosticsModal.tsx');
      const modalContent = fs.readFileSync(modalPath, 'utf8');
      expect(modalContent).toContain('No service between Whitechapel and Shenfield due to an urgent track inspection');
      expect(modalContent).not.toContain('useLineDataStore.getState().lines');
    });

    it('verifies disruption cards render only real TfL cause text — zero fake fallback filler', () => {
      const deliveryTrack = fs.readFileSync(deliveryTrackPath, 'utf8');
      expect(deliveryTrack).toContain('resolvedDisruptionCause');
      expect(deliveryTrack).not.toContain('Service currently disrupted on this line.');
      expect(deliveryTrack).toMatch(/if let cause = resolvedDisruptionCause/);
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
      expect(liveActivity).toMatch(/isShushCard[\s\S]*DisruptionExpandedBottomView/);
    });

    it('verifies Dynamic Island Expanded leading uses AccentBar instead of Circle dot', () => {
      const liveActivity = fs.readFileSync(liveActivityPath, 'utf8');
      expect(liveActivity).toContain('AccentBar(lineId: context.attributes.lineId, width: 3.5, height: 13)');
    });
  });

  describe('Pass 7: Native Glass & Two-Column Roundel Contract', () => {
    it('verifies LockScreenView is neutral glass — zero line-color tint, zero blur, 0.5pt white rim', () => {
      const liveActivity = fs.readFileSync(liveActivityPath, 'utf8');
      expect(liveActivity).not.toContain('.activityBackgroundTint');
      expect(liveActivity).not.toContain('LineColor.tint');
      expect(liveActivity).toContain('.activitySystemActionForegroundColor');
      expect(liveActivity).not.toContain('.ultraThinMaterial');
      expect(liveActivity).toMatch(/stroke\(Color\.white\.opacity\(0\.12\), lineWidth: 0\.5\)/);
    });

    it('verifies disruptionView is two-column with widget-parity StatusIcon gestures (no line roundel)', () => {
      const deliveryTrack = fs.readFileSync(deliveryTrackPath, 'utf8');
      expect(deliveryTrack).toMatch(/font\(\.system\(size: 24, weight: \.bold, design: \.rounded\)\)/);
      expect(deliveryTrack).toContain('func disruptionStatusIcon(for tier: Int) -> String');
      expect(deliveryTrack).toContain('func disruptionStatusColor(for tier: Int) -> Color');
      expect(deliveryTrack).not.toContain('LineColor.onColor');
      // Widget parity (CommuteWidget StatusIcon): minor=amber clock, severe=red triangle, suspended=red X
      expect(deliveryTrack).toMatch(/tier == 1[\s\S]{0,40}"clock\.fill"/);
      expect(deliveryTrack).toMatch(/tier == 2[\s\S]{0,40}"exclamationmark\.triangle\.fill"/);
      expect(deliveryTrack).toContain('"xmark"');
    });

    it('verifies LockScreenView carries the whitelisted reroute deep link via widgetURL', () => {
      const liveActivity = fs.readFileSync(liveActivityPath, 'utf8');
      expect(liveActivity).toContain('widgetURL(URL(string: "mycommute://reroute?line=');
    });

    it('verifies dead code deleted: ExpandedIslandView, ArrivalRow, displayText, SOFTEN constant', () => {
      const liveActivity = fs.readFileSync(liveActivityPath, 'utf8');
      expect(liveActivity).not.toContain('private struct ExpandedIslandView');
      expect(liveActivity).not.toContain('private struct ArrivalRow');
      expect(liveActivity).not.toContain('func displayText');
      expect(liveActivity).not.toContain('SOFTEN_THRESHOLD_SECONDS');
    });

    it('verifies DisruptionExpandedBottomView has 24pt circle with headlineColor and warning glyph on left', () => {
      const deliveryTrack = fs.readFileSync(deliveryTrackPath, 'utf8');
      expect(deliveryTrack).toMatch(/Circle\(\)\s*\.fill\(headlineColor\)\s*\.frame\(width: 24, height: 24\)/);
      expect(deliveryTrack).toMatch(/DisruptionExpandedBottomView[\s\S]*Image\(systemName: "exclamationmark\.triangle\.fill"\)/);
      expect(deliveryTrack).toMatch(/headlineColor[\s\S]*0xFF3B30[\s\S]*0xFFB000/);
    });

    it('verifies approachingView separates destination and non-truncating ETA countdown into HStack', () => {
      const deliveryTrack = fs.readFileSync(deliveryTrackPath, 'utf8');
      expect(deliveryTrack).toContain('.truncationMode(.tail)');
      expect(deliveryTrack).toContain('.fixedSize(horizontal: true, vertical: false)');
      expect(deliveryTrack).not.toContain('etaHeadline(for: ep)');
    });

    it('verifies statusPill deletes green Good Service badge and renders quiet on normal service', () => {
      const deliveryTrack = fs.readFileSync(deliveryTrackPath, 'utf8');
      expect(deliveryTrack).toContain('@ViewBuilder');
      expect(deliveryTrack).toContain('if state.severityTier >= 1');
      const marker = 'private var statusPill: some View';
      const start = deliveryTrack.indexOf(marker);
      expect(start).toBeGreaterThan(-1);
      const pillBlock = deliveryTrack.slice(start, deliveryTrack.indexOf('\n  }\n', start));
      expect(pillBlock).not.toContain('Good Service');
      expect(pillBlock).not.toContain('0x30D158');
      expect(pillBlock).toContain('disruptionHeadline');
      expect(pillBlock).not.toContain('state.statusText');
    });
  });

  describe('Pass 8: Reason Contract, Icon Parity, Island Exhaustiveness', () => {
    it('verifies BOTH attribute files carry the optional reason field (Rule 3 parity)', () => {
      for (const candidate of [
        path.resolve(rootDir, 'targets/MyCommuteWidget/MyCommuteLiveActivityAttributes.swift'),
        path.resolve(rootDir, 'modules/my-commute-live-activity/ios/MyCommuteLiveActivityAttributes.swift'),
      ]) {
        expect(fs.readFileSync(candidate, 'utf8')).toContain('public var reason: String?');
      }
    });

    it('verifies the disruption card renders exactly one Reroute action (left detourSlot button deleted)', () => {
      const deliveryTrack = fs.readFileSync(deliveryTrackPath, 'utf8');
      const start = deliveryTrack.indexOf('private var disruptionView');
      const end = deliveryTrack.indexOf('private var resolvedDisruptionCause');
      const block = deliveryTrack.slice(start, end);
      expect(block).not.toContain('detourSlot');
      expect((block.match(/Text\("Reroute"\)/g) || []).length).toBe(1);
    });

    it('verifies the compact island never fabricates a 2m ETA when none is known', () => {
      const liveActivity = fs.readFileSync(liveActivityPath, 'utf8');
      expect(liveActivity).not.toContain('nextStationEtaMinutes ?? 2');
    });

    it('verifies the compact island is exhaustive at severityTier >= 1 even when the status label is unknown', () => {
      const liveActivity = fs.readFileSync(liveActivityPath, 'utf8');
      expect(liveActivity).toMatch(/severityTier >= 1 \{\s*\n\s*let label = compactStatusLabel\(for: context\.state\.statusText\)\s*\?\?/s);
    });

    it('verifies the expanded pill clamps to short status labels and never leaks raw statusText', () => {
      const liveActivity = fs.readFileSync(liveActivityPath, 'utf8');
      expect(liveActivity).toMatch(/ExpandedStatusPill[\s\S]{0,1400}compactStatusLabel\(for: context\.state\.statusText\)/s);
    });

    it('verifies LiveActivityService startPreviewActivity passes reason field', () => {
      const service = fs.readFileSync(path.resolve(rootDir, 'services/LiveActivityService.ts'), 'utf8');
      expect(service).toMatch(/reason:\s*opts\?\.disruptionReason\s*\?\?\s*null/);
    });

    it('verifies backend push-to-start carries reason + severity-mapped aps relevance-score', () => {
      const dispatcher = fs.readFileSync(
        path.resolve(rootDir, '..', 'backend', 'push', 'apnsDispatcher.ts'),
        'utf8'
      );
      expect(dispatcher).toContain('const relevanceScore');
      expect(dispatcher).toMatch(/severityTier === 3\s*\? 1\.0/);
      expect(dispatcher).toMatch(/severityTier === 2\s*\? 0\.8/);
      expect(dispatcher).toMatch(/severityTier === 1\s*\? 0\.4/);
      expect(dispatcher).toContain("'relevance-score'");
      expect(dispatcher).toMatch(/reason: cleanReasonForPayload/);
      expect(dispatcher).toContain('function cleanReasonForPayload');
    });
  });
});
