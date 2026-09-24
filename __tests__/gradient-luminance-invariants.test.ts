import { STATUS_GRADIENTS, ATMOSPHERIC_BLOOMS } from '../components/DashboardGradient';
import { ONBOARDING_RADAR_GRADIENT, SAPPHIRE_ATMOSPHERIC_BLOOM } from '../theme/colors';

describe('Dashboard Gradient Invariant Contracts', () => {
  const severities = ['good', 'minor', 'severe', 'suspended', 'offline', 'unknown'] as const;

  test('all severities implement the exact 4-tier stop geometry [0, 0.28, 0.65, 1.0]', () => {
    severities.forEach((sev) => {
      expect(STATUS_GRADIENTS[sev]).toBeDefined();
      expect(STATUS_GRADIENTS[sev].colors).toHaveLength(4);
      expect(STATUS_GRADIENTS[sev].locations).toEqual([0, 0.28, 0.65, 1.0]);
    });
  });

  test('offline/unknown base gradient and bloom exactly match Refund Radar reference', () => {
    expect(STATUS_GRADIENTS.offline.colors).toEqual(ONBOARDING_RADAR_GRADIENT.colors);
    expect(STATUS_GRADIENTS.offline.locations).toEqual(ONBOARDING_RADAR_GRADIENT.locations);

    expect(STATUS_GRADIENTS.unknown.colors).toEqual(ONBOARDING_RADAR_GRADIENT.colors);
    expect(STATUS_GRADIENTS.unknown.locations).toEqual(ONBOARDING_RADAR_GRADIENT.locations);

    expect(ATMOSPHERIC_BLOOMS.offline.colors).toEqual(SAPPHIRE_ATMOSPHERIC_BLOOM.colors);
    expect(ATMOSPHERIC_BLOOMS.offline.locations).toEqual(SAPPHIRE_ATMOSPHERIC_BLOOM.locations);
  });

  test('severe and suspended remain distinct red tiers (severe is vivid crimson, suspended is deeper dark red)', () => {
    expect(STATUS_GRADIENTS.severe.colors[0]).toBe('#7A1414');
    expect(STATUS_GRADIENTS.suspended.colors[0]).toBe('#500A0A');

    // Suspended crown hex numeric value is lower (darker) than severe
    const severeRedHex = parseInt(STATUS_GRADIENTS.severe.colors[0].replace('#', ''), 16);
    const suspendedRedHex = parseInt(STATUS_GRADIENTS.suspended.colors[0].replace('#', ''), 16);
    expect(suspendedRedHex).toBeLessThan(severeRedHex);
  });

  test('all atmospheric blooms implement [0, 0.45, 0.90] location falloff with transparent floor', () => {
    severities.forEach((sev) => {
      expect(ATMOSPHERIC_BLOOMS[sev]).toBeDefined();
      expect(ATMOSPHERIC_BLOOMS[sev].colors).toHaveLength(3);
      expect(ATMOSPHERIC_BLOOMS[sev].locations).toEqual([0, 0.45, 0.90]);
      expect(ATMOSPHERIC_BLOOMS[sev].colors[2]).toBe('transparent');
    });
  });
});
