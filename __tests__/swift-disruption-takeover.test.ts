// frontend/__tests__/swift-disruption-takeover.test.ts
// Phase 4 (Swift) structural contract tests for DeliveryTrackView.swift,
// MyCommuteLiveActivityAttributes.swift, and Live Activity cardKind emitters.

import * as fs from 'fs';
import * as path from 'path';

const rootDir = path.resolve(__dirname, '..');
const deliveryTrackPath = path.resolve(rootDir, 'targets/MyCommuteWidget/DeliveryTrackView.swift');
const liveActivityPath = path.resolve(rootDir, 'targets/MyCommuteWidget/MyCommuteLiveActivity.swift');
const widgetAttrPath = path.resolve(rootDir, 'targets/MyCommuteWidget/MyCommuteLiveActivityAttributes.swift');
const moduleAttrPath = path.resolve(rootDir, 'modules/my-commute-live-activity/ios/MyCommuteLiveActivityAttributes.swift');
const liveActivityServicePath = path.resolve(rootDir, 'services/LiveActivityService.ts');
const apnsDispatcherPath = path.resolve(rootDir, '../backend/push/apnsDispatcher.ts');
const pushAlertsCronPath = path.resolve(rootDir, '../backend/app/api/cron/push-alerts/route.ts');
const pollCronPath = path.resolve(rootDir, '../backend/app/api/cron/poll/route.ts');

describe('Phase 4: cardKind View Branching (DeliveryTrackView.swift)', () => {
  const content = fs.readFileSync(deliveryTrackPath, 'utf8');

  test('content does not have unconditional severityTier >= 2 takeover', () => {
    expect(content).not.toMatch(/if state\.severityTier >= 2\s*\{\s*disruptionView/);
  });

  test('content branches on isShushCard using cardKind and station bounds', () => {
    expect(content).toContain('let isShushCard = attributes.cardKind == "shush" || (attributes.cardKind == nil && attributes.originStation.isEmpty && attributes.destinationStation.isEmpty)');
    expect(content).toContain('if isShushCard {');
    expect(content).toContain('disruptionView');
  });

  test('journey cards route through phase switch — train track stays visible during delays', () => {
    expect(content).toContain('switch state.phase {');
    expect(content).toContain('case "line_picker": linePickerView');
    expect(content).toContain('case "in_transit":  inTransitView');
    expect(content).toContain('case "approaching": approachingView');
    expect(content).toContain('case "arrived":     arrivedView');
  });

  test('DeliveryTrackView accepts attributes in its property and initializer', () => {
    expect(content).toContain('let attributes: MyCommuteLiveActivityAttributes');
    expect(content).toContain('public init(attributes: MyCommuteLiveActivityAttributes');
  });
});

describe('Phase 4: statusPill guaranteed-fit bounds (Rule 8)', () => {
  const content = fs.readFileSync(deliveryTrackPath, 'utf8');

  function statusPillBlock(): string {
    const marker = 'private var statusPill: some View';
    const start = content.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    const rest = content.slice(start);
    const end = rest.indexOf('\n  }\n');
    return rest.slice(0, end);
  }

  test('statusPill applies .lineLimit(1) and .fixedSize(horizontal: true, vertical: false)', () => {
    const block = statusPillBlock();
    expect(block).toContain('Text(text)');
    expect(block).toContain('.lineLimit(1)');
    expect(block).toContain('.fixedSize(horizontal: true, vertical: false)');
  });
});

describe('Phase 4: Attributes Struct Parity (Rule 3)', () => {
  const widgetContent = fs.readFileSync(widgetAttrPath, 'utf8');
  const moduleContent = fs.readFileSync(moduleAttrPath, 'utf8');

  test('both copies declare cardKind: String? = nil', () => {
    expect(widgetContent).toContain('public var cardKind: String? = nil');
    expect(moduleContent).toContain('public var cardKind: String? = nil');
  });

  test('zero drift between widget and module copies', () => {
    expect(widgetContent.replace(/\r\n/g, '\n').trim()).toBe(moduleContent.replace(/\r\n/g, '\n').trim());
  });
});

const moduleIndexPath = path.resolve(rootDir, 'modules/my-commute-live-activity/index.ts');
const moduleSwiftPath = path.resolve(rootDir, 'modules/my-commute-live-activity/ios/MyCommuteLiveActivityModule.swift');

describe('Phase 4: Emitter cardKind invariants', () => {
  test('LiveActivityService emits cardKind: "journey" for active commute sessions', () => {
    const content = fs.readFileSync(liveActivityServicePath, 'utf8');
    expect(content).toContain("cardKind?: 'shush' | 'journey';");
    expect(content).toMatch(/cardKind:\s*['"]journey['"]/);
  });

  test('modules/my-commute-live-activity/index.ts exports cardKind in LiveActivityBridgePayload', () => {
    const content = fs.readFileSync(moduleIndexPath, 'utf8');
    expect(content).toContain("cardKind?: 'shush' | 'journey';");
  });

  test('MyCommuteLiveActivityModule extracts cardKind from payload and sets on attributes', () => {
    const content = fs.readFileSync(moduleSwiftPath, 'utf8');
    expect(content).toContain('let cardKind = payload["cardKind"] as? String');
    expect(content).toContain('cardKind: cardKind');
  });

  test('Backend push-to-start emits cardKind: "shush"', () => {
    const apnsContent = fs.readFileSync(apnsDispatcherPath, 'utf8');
    expect(apnsContent).toContain('cardKind?: string;');

    const pushAlertsContent = fs.readFileSync(pushAlertsCronPath, 'utf8');
    expect(pushAlertsContent).toMatch(/cardKind:\s*['"]shush['"]/);

    const pollContent = fs.readFileSync(pollCronPath, 'utf8');
    expect(pollContent).toMatch(/cardKind:\s*['"]shush['"]/);
  });
});

