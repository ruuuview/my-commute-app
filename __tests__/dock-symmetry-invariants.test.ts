import fs from 'fs';
import path from 'path';

describe('Dock Symmetry & Navigation Invariants', () => {
  const tabBarPath = path.resolve(__dirname, '../components/FractalGlassTabBar.tsx');
  const tabBarSrc = fs.readFileSync(tabBarPath, 'utf8');

  test('no space-between on tabs container (prevents 190pt dead void)', () => {
    expect(tabBarSrc).not.toMatch(/justifyContent:\s*['"]space-between['"]/);
    expect(tabBarSrc).toMatch(/justifyContent:\s*['"]center['"]/);
  });

  test('no full-width stretching on tabs container', () => {
    expect(tabBarSrc).not.toMatch(/tabs:\s*\{[^}]*width:\s*['"]100%['"]/);
  });

  test('compact gap between dock buttons (<= 8pt)', () => {
    const gapMatch = tabBarSrc.match(/gap:\s*(\d+)/);
    expect(gapMatch).not.toBeNull();
    const gap = parseInt(gapMatch![1], 10);
    expect(gap).toBeLessThanOrEqual(8);
  });

  test('both tab labels unconditionally rendered (no hidden Radar label bug)', () => {
    // Must NOT conditionally hide the label behind isActive
    expect(tabBarSrc).not.toMatch(/\{isActive\s*&&\s*<Text[^>]*tabLabel/);
    expect(tabBarSrc).toMatch(/<Text[^>]*styles\.tabLabel[^>]*>\s*\{tab\.label\}\s*<\/Text>/);
  });

  test('equal minimum width enforced for dual-button symmetry', () => {
    expect(tabBarSrc).toMatch(/minWidth:\s*114/);
  });
});
