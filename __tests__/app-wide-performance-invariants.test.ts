import fs from 'fs';
import path from 'path';

describe('App-Wide Performance & Anti-Stutter Invariants (TDD)', () => {
  const rootDir = path.resolve(__dirname, '..');

  it('INVARIANT 1: LiveActivityService must not have a static top-level import of userPreferencesStore (breaks startup require cycle)', () => {
    const filePath = path.join(rootDir, 'services', 'LiveActivityService.ts');
    const content = fs.readFileSync(filePath, 'utf8');

    // Matches top-level import { ... } from '../store/userPreferencesStore'
    const staticImportRegex = /^import\s+.*from\s+['"][^'"]*userPreferencesStore['"]/m;
    const hasStaticImport = staticImportRegex.test(content);

    expect(hasStaticImport).toBe(false);
  });

  it('INVARIANT 2: Tabs layout must not animate content opacity to 0 on route switch (eliminates 300ms tab freeze & preserves UIKit blur)', () => {
    const filePath = path.join(rootDir, 'app', '(tabs)', '_layout.tsx');
    const content = fs.readFileSync(filePath, 'utf8');

    // Must not fade out content to 0 on pathname change
    const fadesToZeroRegex = /contentOpacity\.value\s*=\s*withTiming\(\s*0/;
    expect(fadesToZeroRegex.test(content)).toBe(false);

    // Must not wrap Slot in an animated opacity container
    const wrapsSlotInAnimatedOpacity = /<Animated\.View[^>]*contentStyle[^>]*>\s*<Slot\s*\/>/s;
    expect(wrapsSlotInAnimatedOpacity.test(content)).toBe(false);
  });

  it('INVARIANT 3: Refunds tab must guard focus effect with a 60s cooldown to prevent fetch storms and UI freeze', () => {
    const filePath = path.join(rootDir, 'app', '(tabs)', 'refunds.tsx');
    const content = fs.readFileSync(filePath, 'utf8');

    // useFocusEffect block must check lastFetchTimeRef or 60000ms cooldown before calling fetchClaims
    const focusEffectMatch = content.match(/useFocusEffect\(\s*useCallback\(\(\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\[fetchClaims\]\s*\)\s*\)/);
    expect(focusEffectMatch).not.toBeNull();
    const focusEffectBody = focusEffectMatch ? focusEffectMatch[1] : '';

    expect(focusEffectBody).toMatch(/lastFetchTimeRef/);
    expect(focusEffectBody).toMatch(/60_?000/);
  });

  it('INVARIANT 4: Onboarding lines screen must memoize renderItem with useCallback to prevent 19-item re-render cascades', () => {
    const filePath = path.join(rootDir, 'app', 'onboarding', 'lines.tsx');
    const content = fs.readFileSync(filePath, 'utf8');

    // Must wrap renderItem in useCallback
    const memoizedRenderItemRegex = /const\s+renderItem\s*=\s*useCallback\(/;
    expect(memoizedRenderItemRegex.test(content)).toBe(true);

    // Must not recreate inline onPress arrow on every render in LineCard
    const inlineOnPressInCard = /<LineCard[^>]*onPress=\{\(\)\s*=>\s*handleToggleLine\(item\.id\)\}/;
    expect(inlineOnPressInCard.test(content)).toBe(false);
  });

  it('INVARIANT 5: DashboardGrid must not create inline anonymous delete functions inside renderItem on every item render', () => {
    const filePath = path.join(rootDir, 'components', 'DashboardGrid.tsx');
    const content = fs.readFileSync(filePath, 'utf8');

    // Must not pass inline anonymous arrow function onDelete={() => onDelete(item.id)} inside renderItem
    const inlineOnDeleteInRow = /onDelete=\{\(\)\s*=>\s*onDelete\(item\.id\)\}/;
    expect(inlineOnDeleteInRow.test(content)).toBe(false);
  });
});
