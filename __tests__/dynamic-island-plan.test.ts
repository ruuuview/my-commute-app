import { usePillStore } from '../store/pillStore';
import { usePillSuppressionStore } from '../store/pillSuppressionStore';
import { GLASS } from '../theme/colors';
import {
  ENTRY_DURATION_MS,
  EXIT_DURATION_MS,
  SPECULAR_RIM_FADE_IN_MS,
} from '../components/DynamicIslandBanner/constants/notification.consts';

describe('Dynamic Island visual tokens', () => {
  it('uses the requested Deep Obsidian scrim and Space Grotesk hierarchy', () => {
    expect(GLASS.tintOverlay).toBe('rgba(18, 20, 26, 0.72)');
    expect(GLASS.blurIntensity).toBe(35);
  });

  it('keeps hardware GlassView constants and specifies independently timed rim and shell motion', () => {
    expect(ENTRY_DURATION_MS).toBe(420);
    expect(EXIT_DURATION_MS).toBe(480);
    expect(SPECULAR_RIM_FADE_IN_MS).toBe(80);
  });
});

describe('Dynamic Island focused-interaction suppression', () => {
  beforeEach(() => {
    usePillStore.getState().clearPill();
    usePillSuppressionStore.getState().resetForTests();
  });

  it.each(['onboarding', 'modal', 'card-drag'] as const)(
    'rejects a pill while %s owns the UI',
    (reason) => {
      usePillSuppressionStore.getState().beginSuppression(reason);
      usePillStore.getState().requestPill({
        kind: 'intent', id: `blocked-${reason}`, title: 'Title', message: 'Message', accent: '#fff',
      });
      expect(usePillStore.getState().active).toBeNull();
    },
  );

  it('does not resume until every overlapping modal is closed', () => {
    const suppressions = usePillSuppressionStore.getState();
    suppressions.beginSuppression('modal');
    suppressions.beginSuppression('modal');
    suppressions.endSuppression('modal');
    expect(usePillSuppressionStore.getState().isSuppressed).toBe(true);
    usePillSuppressionStore.getState().endSuppression('modal');
    expect(usePillSuppressionStore.getState().isSuppressed).toBe(false);
  });
});
