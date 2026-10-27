import fs from 'fs';
import path from 'path';

describe('Dock Layering & Touch Pass-Through Invariants', () => {
  const layoutPath = path.resolve(__dirname, '../app/(tabs)/_layout.tsx');
  const tabBarPath = path.resolve(__dirname, '../components/FractalGlassTabBar.tsx');

  const layoutSrc = fs.readFileSync(layoutPath, 'utf8');
  const tabBarSrc = fs.readFileSync(tabBarPath, 'utf8');

  test('tabBarContainer defines zIndex between 10 and 999 to render in front of cardSurface (zIndex: 2)', () => {
    const tabBarContainerMatch = layoutSrc.match(/tabBarContainer:\s*\{([^}]+)\}/);
    expect(tabBarContainerMatch).not.toBeNull();
    const styleBody = tabBarContainerMatch![1];
    const zIndexMatch = styleBody.match(/zIndex:\s*(\d+)/);
    expect(zIndexMatch).not.toBeNull();
    const zIndex = parseInt(zIndexMatch![1], 10);
    expect(zIndex).toBeGreaterThanOrEqual(10);
    expect(zIndex).toBeLessThanOrEqual(999);
  });

  test('tabBarContainer defines elevation >= 10 for Android stacking parity', () => {
    const tabBarContainerMatch = layoutSrc.match(/tabBarContainer:\s*\{([^}]+)\}/);
    expect(tabBarContainerMatch).not.toBeNull();
    const styleBody = tabBarContainerMatch![1];
    const elevationMatch = styleBody.match(/elevation:\s*(\d+)/);
    expect(elevationMatch).not.toBeNull();
    const elevation = parseInt(elevationMatch![1], 10);
    expect(elevation).toBeGreaterThanOrEqual(10);
  });

  test('tabBarContainer defines pointerEvents: "box-none" in stylesheet', () => {
    const tabBarContainerMatch = layoutSrc.match(/tabBarContainer:\s*\{([^}]+)\}/);
    expect(tabBarContainerMatch).not.toBeNull();
    const styleBody = tabBarContainerMatch![1];
    expect(styleBody).toMatch(/pointerEvents:\s*['"]box-none['"]/);
  });

  test('Animated.View wrapping tabBarContainer in _layout.tsx has pointerEvents="box-none" JSX prop', () => {
    const animatedViewTags = layoutSrc.match(/<Animated\.View\b[^>]*>/gs) || [];
    const tabBarAnimatedView = animatedViewTags.find(tag => tag.includes('styles.tabBarContainer'));
    expect(tabBarAnimatedView).toBeDefined();
    expect(tabBarAnimatedView).toMatch(/pointerEvents=["']box-none["']/);
  });

  test('Root <View> in FractalGlassTabBar.tsx has pointerEvents="box-none" JSX prop', () => {
    const viewTags = tabBarSrc.match(/<View\b[^>]*>/gs) || [];
    const containerView = viewTags.find(tag => tag.includes('styles.container'));
    expect(containerView).toBeDefined();
    expect(containerView).toMatch(/pointerEvents=["']box-none["']/);
  });

  test('tabBarContainer zIndex strictly exceeds AppleSwipeableRow cardSurface zIndex', () => {
    const swipeablePath = path.resolve(__dirname, '../components/AppleSwipeableRow.tsx');
    const swipeableSrc = fs.readFileSync(swipeablePath, 'utf8');
    const cardSurfaceMatch = swipeableSrc.match(/cardSurface:\s*\{([^}]+)\}/);
    expect(cardSurfaceMatch).not.toBeNull();
    const cardZIndexMatch = cardSurfaceMatch![1].match(/zIndex:\s*(\d+)/);
    expect(cardZIndexMatch).not.toBeNull();
    const cardZIndex = parseInt(cardZIndexMatch![1], 10);

    const tabBarContainerMatch = layoutSrc.match(/tabBarContainer:\s*\{([^}]+)\}/);
    const zIndexMatch = tabBarContainerMatch![1].match(/zIndex:\s*(\d+)/);
    const tabBarZIndex = parseInt(zIndexMatch![1], 10);

    expect(tabBarZIndex).toBeGreaterThan(cardZIndex);
  });

  test('FractalGlassTabBar container defines pointerEvents: "box-none" in stylesheet', () => {
    const containerMatch = tabBarSrc.match(/container:\s*\{([^}]+)\}/);
    expect(containerMatch).not.toBeNull();
    const styleBody = containerMatch![1];
    expect(styleBody).toMatch(/pointerEvents:\s*['"]box-none['"]/);
  });
});

