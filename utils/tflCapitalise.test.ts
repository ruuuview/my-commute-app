// utils/tflCapitalise.test.ts
import { tflCapitalise } from './tflCapitalise';

describe('tflCapitalise', () => {
  // Exception map — exact matches
  it('preserves King\'s Cross St. Pancras', () => {
    expect(tflCapitalise("king's cross st. pancras")).toBe("King's Cross St. Pancras");
  });

  it('preserves Heathrow Terminals 2 & 3 with ampersand', () => {
    expect(tflCapitalise("heathrow terminals 2 & 3")).toBe("Heathrow Terminals 2 & 3");
  });

  it('preserves O2 Centre capitalisation', () => {
    expect(tflCapitalise("o2 centre")).toBe("O2 Centre");
  });

  it('preserves St. Paul\'s apostrophe', () => {
    expect(tflCapitalise("st. paul's")).toBe("St. Paul's");
  });

  // Standard title case fallback
  it('title-cases a standard station name', () => {
    expect(tflCapitalise("oxford circus")).toBe("Oxford Circus");
  });

  it('handles empty string without throwing', () => {
    expect(tflCapitalise("")).toBe("");
  });

  // Edge cases
  it('does not double-capitalise possessive midword', () => {
    expect(tflCapitalise("shepherd's bush")).toBe("Shepherd's Bush");
    const result = tflCapitalise("shepherd's bush");
    expect(result).not.toContain("'S"); // "Bush'S" would be wrong
  });

  it('is case-insensitive for input', () => {
    expect(tflCapitalise("OXFORD CIRCUS")).toBe("Oxford Circus");
    expect(tflCapitalise("KING'S CROSS ST. PANCRAS")).toBe("King's Cross St. Pancras");
  });
});
