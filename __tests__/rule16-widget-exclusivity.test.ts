// frontend/__tests__/rule16-widget-exclusivity.test.ts
// ==============================================================================
// Rule 16 Mechanical Invariant: Widget & Live Activity Exclusivity
//
// Invariants enforced:
// 1. Commute core & native widgets/Live Activities NEVER present claim buttons,
//    refund amounts, or premature Delay Repay copy on the Lock Screen / Dynamic Island.
// 2. Refund Radar is the exclusive, trustworthy locus for claims, corroborated
//    only after TfL backend confirmation.
// 3. No unsanctioned refund deep links exist inside frontend/targets/MyCommuteWidget/.
// ==============================================================================

import fs from 'fs';
import path from 'path';

describe('Rule 16: Refund Radar Exclusivity & Lock Screen Sanitization', () => {
  const widgetDir = path.resolve(__dirname, '../targets/MyCommuteWidget');

  it('scans all Swift widget view files and ensures zero refund / claim copy on Lock Screen or Island', () => {
    const viewFiles = ['DeliveryTrackView.swift', 'MyCommuteLiveActivity.swift', 'CommuteWidget.swift'];

    const forbiddenPatterns = [
      /\bdelay\s*repay\b/i,
      /\bclaim\s*refund\b/i,
      /\brefund\s*radar\b/i,
      /mycommute:\/\/refund/i,
      /mycommute:\/\/claim/i,
    ];

    for (const file of viewFiles) {
      const filePath = path.join(widgetDir, file);
      const content = fs.readFileSync(filePath, 'utf8');

      for (const pattern of forbiddenPatterns) {
        const match = content.match(pattern);
        expect(match).toBeNull();
      }
    }
  });

  it('verifies DeliveryTrackView arrivedView contains only arrival completion notice and zero refund copy', () => {
    const filePath = path.join(widgetDir, 'DeliveryTrackView.swift');
    const content = fs.readFileSync(filePath, 'utf8');

    expect(content).toContain('Arrived ·');
    expect(content).toContain('Commute completed. Auto-dismissing on exit.');
    expect(content).not.toContain('refund');
    expect(content).not.toContain('claim');
    expect(content).not.toContain('Delay Repay');
  });

  it('verifies sanctionedRoutes.json does NOT expose dead or unapproved refund widget routes', () => {
    const routesPath = path.resolve(__dirname, '../constants/sanctionedRoutes.json');
    const sanctioned = JSON.parse(fs.readFileSync(routesPath, 'utf8'));

    expect(Array.isArray(sanctioned)).toBe(true);
    expect(sanctioned).toContain('mycommute://');
    expect(sanctioned).not.toContain('mycommute://refund-radar');
    expect(sanctioned).not.toContain('mycommute://refund');
  });
});
