import { NORTHERN_SHADES, LINE_IDENTITY_COLORS } from '../constants/lineColors';
import { getPillColors } from '../utils/pillColors';
import * as fs from 'fs';
import * as path from 'path';

function parseAlphaFromRgba(rgba: string): number {
  const match = rgba.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/);
  return match ? parseFloat(match[1]) : 1.0;
}

function hexToLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = hexToLuminance(hex1);
  const l2 = hexToLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('Northern Line Poka-Yoke Invariants', () => {
  test('NORTHERN_SHADES defines valid specular obsidian tones and high-contrast boundaries', () => {
    expect(NORTHERN_SHADES.brand).toBe('#000000');
    expect(NORTHERN_SHADES.shadowColor).toBe('#000000');
    expect(NORTHERN_SHADES.highlightBorder).toBe('#000000');
    expect(NORTHERN_SHADES.highlightBorder).not.toBe('#FFFFFF');
    expect(NORTHERN_SHADES.highlightBorder).not.toMatch(/#fff/i);
    expect(NORTHERN_SHADES.pillBorder).toBe('#8A90A0');

    // Systemic guardrail 1: Wash must be subtle dark depth (never choking opaque black box)
    expect(NORTHERN_SHADES.highlightWash).toMatch(/rgba\(\s*0,\s*0,\s*0/);
    const washAlpha = parseAlphaFromRgba(NORTHERN_SHADES.highlightWash);
    expect(washAlpha).toBeLessThanOrEqual(0.25);
    expect(washAlpha).toBeGreaterThan(0.0);

    // Systemic guardrail 2: Pill border rim contrast against card background (#0A1128) must be >= 3:1
    const cardBg = '#0A1128';
    expect(contrastRatio(NORTHERN_SHADES.pillBorder, cardBg)).toBeGreaterThanOrEqual(3.0);
  });

  test('getPillColors for Northern uses NORTHERN_SHADES and meets minimum contrast ratio', () => {
    const northernPill = getPillColors('northern', LINE_IDENTITY_COLORS.northern);
    expect(northernPill.borderColor).toBe(NORTHERN_SHADES.pillBorder);
    expect(northernPill.backgroundColor).toBe(NORTHERN_SHADES.pillBackground);
    expect(northernPill.dotColor).toBe(NORTHERN_SHADES.brand);
    expect(contrastRatio(northernPill.borderColor, '#0A1128')).toBeGreaterThanOrEqual(3.0);
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
