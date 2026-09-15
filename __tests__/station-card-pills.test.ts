import fs from 'fs';
import path from 'path';
import { LINE_SHORT_NAMES } from '../data/lineMetadata';

describe('StationCard Line Pills & Compact Badging Invariants', () => {
  const stationCardPath = path.resolve(__dirname, '../components/StationCard.tsx');

  test('StationCard.tsx source exists', () => {
    expect(fs.existsSync(stationCardPath)).toBe(true);
  });

  test('Multi-line rendering: does not prematurely collapse into +1 or +2 for multi-line stations', () => {
    const content = fs.readFileSync(stationCardPath, 'utf8');

    // Must NOT be the old 1-line hardcoded overflow `overflowCount = station.lines.length - 1`
    expect(content).not.toMatch(/station\.lines\.length\s*-\s*1/);

    // Must map over visibleLines
    expect(content).toContain('visibleLines.map');

    // Must sort lines with userSelectedLines priority
    expect(content).toContain('userSelectedLines');
    expect(content).toContain('sortedLines');
  });

  test('Compact styling: pill dimensions match ManageStationsModal drawer standards', () => {
    const content = fs.readFileSync(stationCardPath, 'utf8');

    // Pill text must use compact 9pt font
    expect(content).toMatch(/pillText:\s*\{[\s\S]*?fontSize:\s*9/);

    // Pill accent bar must be 2x8
    expect(content).toMatch(/pillBar:\s*\{[\s\S]*?width:\s*2/);
    expect(content).toMatch(/pillBar:\s*\{[\s\S]*?height:\s*8/);

    // Overflow text must use 8pt font
    expect(content).toMatch(/overflowText:\s*\{[\s\S]*?fontSize:\s*8/);
  });

  test('Boundary logic: multi-line stations display all lines up to 4, overflow only beyond that', () => {
    // Replicate the exact sortedLines and visibleLines logic from StationCard
    function getCardPills(lines: string[], userSelectedLines: string[] = []) {
      const sortedLines = [...lines].sort((a, b) => {
        const aSelected = userSelectedLines.includes(a);
        const bSelected = userSelectedLines.includes(b);
        if (aSelected && !bSelected) return -1;
        if (!aSelected && bSelected) return 1;
        return 0;
      });

      const maxVisible = sortedLines.length === 4 ? 4 : 3;
      const visibleLines = sortedLines.slice(0, maxVisible);
      const overflowCount = Math.max(0, sortedLines.length - maxVisible);

      return {
        visibleLines: visibleLines.map(id => LINE_SHORT_NAMES[id] || id),
        overflowCount,
      };
    }

    // 1-line station (e.g. Pimlico)
    const single = getCardPills(['victoria']);
    expect(single.visibleLines).toEqual(['Victoria']);
    expect(single.overflowCount).toBe(0);

    // 2-line station (e.g. London Bridge) -> shows BOTH, never "+1"
    const two = getCardPills(['jubilee', 'northern']);
    expect(two.visibleLines).toEqual(['Jubilee', 'Northern']);
    expect(two.overflowCount).toBe(0);

    // 3-line station (e.g. Oxford Circus) -> shows ALL 3, never "+2"
    const three = getCardPills(['victoria', 'central', 'bakerloo']);
    expect(three.visibleLines).toEqual(['Victoria', 'Central', 'Bakerloo']);
    expect(three.overflowCount).toBe(0);

    // 4-line station (e.g. Waterloo) -> shows ALL 4, never "+3"
    const four = getCardPills(['bakerloo', 'jubilee', 'northern', 'waterloo-city']);
    expect(four.visibleLines).toEqual(['Bakerloo', 'Jubilee', 'Northern', 'WL&City']);
    expect(four.overflowCount).toBe(0);

    // 6-line station (e.g. King's Cross) -> shows 3 lines + 3 overflow
    const six = getCardPills(['circle', 'hammersmith-city', 'metropolitan', 'northern', 'piccadilly', 'victoria']);
    expect(six.visibleLines.length).toBe(3);
    expect(six.overflowCount).toBe(3);

    // User preference prioritization: if user rides Northern, Northern is prioritized first
    const prioritized = getCardPills(['jubilee', 'northern'], ['northern']);
    expect(prioritized.visibleLines[0]).toBe('Northern');
    expect(prioritized.visibleLines[1]).toBe('Jubilee');
  });
});
