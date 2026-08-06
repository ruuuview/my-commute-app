// utils/__tests__/getSeverityColor.test.ts
// Phase 3 invariant snapshot (AGENTS.md §0): every status→color decision
// routes through this module. Dashboard dot === drawer color, because both
// render paths import the same function. No severity color may live outside.

import { getSeverityColor, getSeverityLabel, STATUS_SEVERITY_COLORS } from '../getSeverityColor';

const GOOD = '#30D158';
const MINOR = '#FFB000';
const SEVERE = '#FF3B30';

// Suspended / closure / bus / not-running bucket — collapsed into 'severe'.
const SUSPENDED_CODES = [0, 1, 2, 3, 4, 5, 8, 11, 16, 17, 19, 20];

describe('getSeverityColor — invariant snapshot', () => {
  it('never throws for any TfL code 0..20', () => {
    for (let code = 0; code <= 20; code++) {
      expect(() => getSeverityColor(code)).not.toThrow();
      expect(() => getSeverityColor(code, 'Some description')).not.toThrow();
      expect(() => getSeverityLabel(code)).not.toThrow();
    }
  });

  it('maps 10/18/14 → good + #30D158', () => {
    for (const code of [10, 18, 14]) {
      expect(getSeverityColor(code)).toEqual({ color: GOOD, label: 'good' });
      expect(getSeverityLabel(code)).toBe('good');
    }
  });

  it('maps 9/7 → minor + #FFB000', () => {
    for (const code of [9, 7]) {
      expect(getSeverityColor(code)).toEqual({ color: MINOR, label: 'minor' });
      expect(getSeverityLabel(code)).toBe('minor');
    }
  });

  it('maps 6 → severe + #FF3B30', () => {
    expect(getSeverityColor(6)).toEqual({ color: SEVERE, label: 'severe' });
    expect(getSeverityLabel(6)).toBe('severe');
  });

  it('collapses every suspended/closure code into severe + #FF3B30', () => {
    for (const code of SUSPENDED_CODES) {
      expect(getSeverityColor(code)).toEqual({ color: SEVERE, label: 'severe' });
      expect(getSeverityLabel(code)).toBe('severe');
    }
  });

  it('falls back to text parsing when the code is missing', () => {
    expect(getSeverityColor(undefined, 'Severe Delays')).toEqual({ color: SEVERE, label: 'severe' });
    expect(getSeverityColor(undefined, 'Part Closure')).toEqual({ color: SEVERE, label: 'severe' });
    expect(getSeverityColor(undefined, 'Service Closed')).toEqual({ color: SEVERE, label: 'severe' });
    expect(getSeverityColor(undefined, 'Minor Delays')).toEqual({ color: MINOR, label: 'minor' });
    expect(getSeverityColor(undefined, 'Good Service')).toEqual({ color: GOOD, label: 'good' });
  });

  it('unknown code 99 defaults to good (parity with pre-unification dashboard)', () => {
    expect(getSeverityColor(99)).toEqual({ color: GOOD, label: 'good' });
    expect(getSeverityColor(99, 'Anything at all')).toEqual({ color: GOOD, label: 'good' });
    expect(getSeverityLabel(99)).toBe('good');
  });

  it('STATUS_SEVERITY_COLORS is the canonical token map', () => {
    expect(STATUS_SEVERITY_COLORS).toEqual({ good: GOOD, minor: MINOR, severe: SEVERE });
  });
});
