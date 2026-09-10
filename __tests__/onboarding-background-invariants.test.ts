import {
  ONBOARDING_RADAR_GRADIENT,
  ONBOARDING_GRADIENT,
  MASTER_CANVAS,
  SETTINGS_BACKGROUND_GRADIENT,
  SAPPHIRE_ATMOSPHERIC_BLOOM,
} from '../theme/colors';
import * as fs from 'fs';
import * as path from 'path';

describe('Onboarding & Canvas Luminous Sapphire Invariants', () => {
  test('ONBOARDING_RADAR_GRADIENT defines luminous royal sapphire top and deep OLED floor', () => {
    expect(ONBOARDING_RADAR_GRADIENT.colors).toBeDefined();
    expect(ONBOARDING_RADAR_GRADIENT.colors.length).toBeGreaterThanOrEqual(3);

    // Stop 0 must be vibrant royal sapphire, not dull black or grey
    const topColor = ONBOARDING_RADAR_GRADIENT.colors[0].toUpperCase();
    expect(topColor).toBe('#003380');

    // Floor must settle into dark OLED floor
    const floorColor = ONBOARDING_RADAR_GRADIENT.colors[ONBOARDING_RADAR_GRADIENT.colors.length - 1].toUpperCase();
    expect(floorColor).toBe('#02040A');

    // Poka-yoke: Never assign pure white or murky grey to background canvas
    ONBOARDING_RADAR_GRADIENT.colors.forEach((color) => {
      expect(color.toUpperCase()).not.toBe('#FFFFFF');
      expect(color).not.toBe('#0A163A'); // Old dull clobbered value
    });

    // ONBOARDING_GRADIENT alias points to ONBOARDING_RADAR_GRADIENT
    expect(ONBOARDING_GRADIENT).toEqual(ONBOARDING_RADAR_GRADIENT);

    // SAPPHIRE_ATMOSPHERIC_BLOOM defines specular sapphire optical bloom
    expect(SAPPHIRE_ATMOSPHERIC_BLOOM.colors[0]).toBe('rgba(0, 102, 204, 0.24)');
  });

  test('VAULT_SETTINGS_GRADIENT and SETTINGS_BACKGROUND_GRADIENT use luminous sapphire crown', () => {
    expect(MASTER_CANVAS.VAULT_SETTINGS_GRADIENT[0]).toBe('#002D7A');
    expect(SETTINGS_BACKGROUND_GRADIENT.colors).toEqual(MASTER_CANVAS.VAULT_SETTINGS_GRADIENT);
  });

  test('OnboardingGradient component uses ONBOARDING_RADAR_GRADIENT and renders dual-layer bloom', () => {
    const compPath = path.resolve(__dirname, '../components/OnboardingGradient.tsx');
    expect(fs.existsSync(compPath)).toBe(true);
    const content = fs.readFileSync(compPath, 'utf8');

    // Must import ONBOARDING_RADAR_GRADIENT and SAPPHIRE_ATMOSPHERIC_BLOOM
    expect(content).toContain('ONBOARDING_RADAR_GRADIENT');
    expect(content).toContain('SAPPHIRE_ATMOSPHERIC_BLOOM');

    // Must render dual LinearGradient layers (base flow + atmospheric bloom)
    const matches = content.match(/<LinearGradient/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  test('All primary onboarding routes and Refund Radar render OnboardingGradient', () => {
    const screens = [
      path.resolve(__dirname, '../app/onboarding/lines.tsx'),
      path.resolve(__dirname, '../app/onboarding/stations.tsx'),
      path.resolve(__dirname, '../app/onboarding/tfl-registration.tsx'),
      path.resolve(__dirname, '../app/(tabs)/refunds.tsx'),
      path.resolve(__dirname, '../app/refunds/history.tsx'),
    ];

    screens.forEach((screenPath) => {
      expect(fs.existsSync(screenPath)).toBe(true);
      const content = fs.readFileSync(screenPath, 'utf8');
      expect(content).toContain('OnboardingGradient');
      expect(content).toContain('<OnboardingGradient');
    });
  });

  test('SettingsScreen binds to SETTINGS_BACKGROUND_GRADIENT and CANVAS_LONDON_NIGHT', () => {
    const settingsPath = path.resolve(__dirname, '../app/settings.tsx');
    expect(fs.existsSync(settingsPath)).toBe(true);
    const content = fs.readFileSync(settingsPath, 'utf8');

    expect(content).toContain('SETTINGS_BACKGROUND_GRADIENT');
    expect(content).toContain('CANVAS_LONDON_NIGHT');
    expect(content).toContain('backgroundColor: CANVAS_LONDON_NIGHT');
  });

  test('SafariClaimAssistant binds toolbarColor to CANVAS_LONDON_NIGHT', () => {
    const compPath = path.resolve(__dirname, '../components/refunds/SafariClaimAssistant.tsx');
    expect(fs.existsSync(compPath)).toBe(true);
    const content = fs.readFileSync(compPath, 'utf8');

    expect(content).toContain('toolbarColor: CANVAS_LONDON_NIGHT');
    expect(content).not.toContain("toolbarColor: '#0A0F3C'");
  });

  test('Poka-Yoke: Zero raw legacy background hexes (#0A0F3C, #0A163A, #030818) in styles across app and refund components', () => {
    const filesToAudit = [
      path.resolve(__dirname, '../app/settings.tsx'),
      path.resolve(__dirname, '../app/(tabs)/refunds.tsx'),
      path.resolve(__dirname, '../app/refunds/history.tsx'),
      path.resolve(__dirname, '../app/onboarding/lines.tsx'),
      path.resolve(__dirname, '../app/onboarding/stations.tsx'),
      path.resolve(__dirname, '../app/onboarding/tfl-registration.tsx'),
      path.resolve(__dirname, '../components/refunds/SafariClaimAssistant.tsx'),
    ];

    filesToAudit.forEach((filePath) => {
      const content = fs.readFileSync(filePath, 'utf8');
      // Must never use legacy backgrounds
      expect(content).not.toMatch(/backgroundColor:\s*['"]#0A0F3C['"]/i);
      expect(content).not.toMatch(/backgroundColor:\s*['"]#0A163A['"]/i);
      expect(content).not.toMatch(/backgroundColor:\s*['"]#030818['"]/i);
    });
  });
});
