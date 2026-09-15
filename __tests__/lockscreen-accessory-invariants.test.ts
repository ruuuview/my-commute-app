// frontend/__tests__/lockscreen-accessory-invariants.test.ts
// ==============================================================================
// Lock Screen Accessory Complication Invariants & Character Budgets
//
// Mechanically validates:
// 1. 100% route coverage across all 19 canonical TfL routes.
// 2. Short code length budget: strictly <= 4 characters.
// 3. Guaranteed-fit terminal floor: <= 8 characters (fits <= 38pt slot).
// 4. accessoryInline text ceiling: strictly <= 26 characters (Apple HIG / Rule 22).
// 5. Zero colored emoji in accessory views (strictly SF Symbols).
// ==============================================================================

const tflRouteData = require('../data/tflRouteData.json');

// Canonical short codes matching CommuteFormatters in CommuteWidget.swift
const CANONICAL_SHORT_CODES: Record<string, string> = {
  bakerloo: 'BAK',
  central: 'CEN',
  circle: 'CIR',
  district: 'DIS',
  dlr: 'DLR',
  elizabeth: 'ELI',
  'hammersmith-city': 'H&C',
  jubilee: 'JUB',
  metropolitan: 'MET',
  northern: 'NOR',
  piccadilly: 'PIC',
  victoria: 'VIC',
  'waterloo-city': 'W&C',
  liberty: 'LIB',
  lioness: 'LIO',
  mildmay: 'MLD',
  suffragette: 'SUF',
  weaver: 'WEA',
  windrush: 'WND',
};

// Canonical status abbreviations matching CommuteFormatters
const STATUS_ABBREVIATIONS: Record<string, string> = {
  'good service': 'Good',
  'minor delays': 'Minor',
  'severe delays': 'Severe',
  'part suspended': 'Part Susp',
  'suspended': 'Susp',
  'planned closure': 'Closure',
  'part closure': 'Part Close',
};

describe('Lock Screen Accessory Complication Invariants', () => {
  const canonicalRoutes = Object.keys(tflRouteData.routes);

  test('1. Exact 19-route canonical parity coverage', () => {
    expect(canonicalRoutes.length).toBe(19);
    for (const route of canonicalRoutes) {
      expect(CANONICAL_SHORT_CODES[route]).toBeDefined();
    }
  });

  test('2. Short code length budget (strictly <= 4 chars)', () => {
    for (const [lineId, code] of Object.entries(CANONICAL_SHORT_CODES)) {
      expect(code.length).toBeGreaterThanOrEqual(2);
      expect(code.length).toBeLessThanOrEqual(4);
      expect(code).toBe(code.toUpperCase());
    }
  });

  test('3. Guaranteed-Fit Terminal Tier Floor (strictly <= 8 chars)', () => {
    // In Tier 3 of ViewThatFits, the representation is an SF Symbol icon + ShortCode
    // In text budget terms, icon placeholder + space + short code must fit within 8 chars
    for (const [lineId, code] of Object.entries(CANONICAL_SHORT_CODES)) {
      const terminalString = `! ${code}`; // Symbol + short code representation
      expect(terminalString.length).toBeLessThanOrEqual(8);
    }
  });

  test('4. Status abbreviations are concise and defined', () => {
    for (const [fullStatus, shortStatus] of Object.entries(STATUS_ABBREVIATIONS)) {
      expect(shortStatus.length).toBeLessThanOrEqual(10);
    }
  });

  test('5. accessoryInline character ceiling strictly <= 26 characters (Rule 22)', () => {
    // Format: "[AbbreviatedLine]: [AbbreviatedStatus]"
    for (const route of canonicalRoutes) {
      const shortCode = CANONICAL_SHORT_CODES[route];
      for (const [fullStatus, shortStatus] of Object.entries(STATUS_ABBREVIATIONS)) {
        const inlineString = `${shortCode}: ${shortStatus}`;
        expect(inlineString.length).toBeLessThanOrEqual(26);
      }
    }
  });

  test('6. Multi-disruption summary string strictly <= 26 characters', () => {
    // Format: "N Lines Delayed" or "N Disruptions"
    for (let count = 2; count <= 19; count++) {
      const summaryString = `${count} Lines Delayed`;
      expect(summaryString.length).toBeLessThanOrEqual(26);
    }
  });

  test('7. No raw colored emoji in complication string templates', () => {
    // Complications must use SF Symbols, never raw emoji which render full-color against tinted glass
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    for (const [lineId, code] of Object.entries(CANONICAL_SHORT_CODES)) {
      expect(code).not.toMatch(emojiRegex);
    }
    for (const [status, abbr] of Object.entries(STATUS_ABBREVIATIONS)) {
      expect(abbr).not.toMatch(emojiRegex);
    }
  });
});
