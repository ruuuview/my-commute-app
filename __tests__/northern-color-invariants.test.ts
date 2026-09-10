import { NORTHERN_SHADES, LINE_IDENTITY_COLORS } from '../constants/lineColors';
import { getPillColors } from '../utils/pillColors';
import * as fs from 'fs';
import * as path from 'path';

describe('Northern Line Poka-Yoke Invariants', () => {
  test('NORTHERN_SHADES defines valid dark/obsidian tones and zero white fallbacks', () => {
    expect(NORTHERN_SHADES.brand).toBe('#000000');
    expect(NORTHERN_SHADES.shadowColor).toBe('#000000');
    expect(NORTHERN_SHADES.highlightBorder).toBe('#3A3A42');
    expect(NORTHERN_SHADES.pillBorder).toBe('#3A3A42');

    // Prove no white / silver hex or rgba values exist in NORTHERN_SHADES
    Object.values(NORTHERN_SHADES).forEach((value) => {
      expect(value).not.toMatch(/#fff/i);
      expect(value).not.toMatch(/#ffffff/i);
      expect(value).not.toMatch(/rgba\(255,\s*255,\s*255/i);
    });
  });

  test('getPillColors for Northern uses NORTHERN_SHADES and never white border or wash', () => {
    const northernPill = getPillColors('northern', LINE_IDENTITY_COLORS.northern);
    expect(northernPill.borderColor).toBe(NORTHERN_SHADES.pillBorder);
    expect(northernPill.backgroundColor).toBe(NORTHERN_SHADES.pillBackground);
    expect(northernPill.dotColor).toBe(NORTHERN_SHADES.brand);
    expect(northernPill.borderColor).not.toBe('#FFFFFF');
    expect(northernPill.borderColor).not.toMatch(/rgba\(255,\s*255,\s*255/i);
  });

  test('All components rendering line indicators bind Northern to NORTHERN_SHADES', () => {
    const componentsDir = path.resolve(__dirname, '../components');
    const checkedFiles = [
      'LineCard.tsx',
      'DepartureCard.tsx',
      'LineDetailModal.tsx',
      'StationCard.tsx',
      'StationDetailScreen.tsx',
      'RerouteScreen.tsx',
      'refunds/ActiveClaimHeroCard.tsx',
      'refunds/MonitoredCorridorsRow.tsx',
    ];

    checkedFiles.forEach((file) => {
      const fullPath = path.join(componentsDir, file);
      expect(fs.existsSync(fullPath)).toBe(true);
      const content = fs.readFileSync(fullPath, 'utf8');

      // 1. Must import NORTHERN_SHADES
      expect(content).toContain('NORTHERN_SHADES');

      // 2. Must use NORTHERN_SHADES.highlightBorder or NORTHERN_SHADES.highlightWash
      const usesNorthernShades =
        content.includes('NORTHERN_SHADES.highlightBorder') ||
        content.includes('NORTHERN_SHADES.highlightWash') ||
        content.includes('NORTHERN_SHADES.pillBorder');
      expect(usesNorthernShades).toBe(true);

      // 3. Poka-yoke: Never assign white border or shadow to northern
      expect(content).not.toMatch(/line\.id === 'northern'\s*\?\s*['"]rgba\(255,\s*255,\s*255/i);
      expect(content).not.toMatch(/isNorthern\s*\?\s*['"]rgba\(255,\s*255,\s*255/i);
    });
  });
});
