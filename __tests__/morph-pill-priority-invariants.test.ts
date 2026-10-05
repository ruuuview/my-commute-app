import { usePillStore, PRIORITY } from '../store/pillStore';
import { useUserPreferencesStore } from '../store/userPreferencesStore';

describe('Morph Pill Priority & Preemption Invariants', () => {
  beforeEach(() => {
    usePillStore.getState().clearPill();
  });

  it('enforces strict priority ordering: disruption (5) > boarding (4) > primer (3) > recovery (2)', () => {
    expect(PRIORITY.disruption).toBe(5);
    expect(PRIORITY.boarding).toBe(4);
    expect(PRIORITY.primer).toBe(3);
    expect(PRIORITY.recovery).toBe(2);

    expect(PRIORITY.disruption).toBeGreaterThan(PRIORITY.boarding);
    expect(PRIORITY.boarding).toBeGreaterThan(PRIORITY.primer);
    expect(PRIORITY.primer).toBeGreaterThan(PRIORITY.recovery);
  });

  it('allows higher priority pills to preempt lower priority pills across all levels', () => {
    // 1. Recovery active -> preempted by Primer
    usePillStore.getState().requestPill({
      kind: 'recovery',
      tier: 'compact',
      id: 'rec-1',
      title: 'Recovery',
      message: 'Good service resumed',
      accent: '#0098D4',
    });
    expect(usePillStore.getState().active?.kind).toBe('recovery');

    usePillStore.getState().requestPill({
      kind: 'primer',
      tier: 'standard',
      id: 'prim-1',
      title: 'Primer',
      message: 'Enable alerts',
      accent: '#0A84FF',
    });
    expect(usePillStore.getState().active?.kind).toBe('primer');

    // 2. Primer active -> preempted by Boarding
    usePillStore.getState().requestPill({
      kind: 'boarding',
      tier: 'standard',
      id: 'board-1',
      title: 'Boarding',
      message: 'Arriving in 2m',
      accent: '#0098D4',
    });
    expect(usePillStore.getState().active?.kind).toBe('boarding');

    // 3. Boarding active -> preempted by Disruption
    usePillStore.getState().requestPill({
      kind: 'disruption',
      tier: 'expanded',
      id: 'dis-1',
      title: 'Disruption',
      message: 'Severe delays',
      accent: '#FF3B30',
    });
    expect(usePillStore.getState().active?.kind).toBe('disruption');
  });

  it('drops incoming lower priority requests when a higher priority pill is active', () => {
    // Disruption active (5)
    usePillStore.getState().requestPill({
      kind: 'disruption',
      tier: 'expanded',
      id: 'dis-1',
      title: 'Disruption',
      message: 'Severe delays',
      accent: '#FF3B30',
    });

    // Boarding arrives (4) -> dropped
    usePillStore.getState().requestPill({
      kind: 'boarding',
      tier: 'standard',
      id: 'board-1',
      title: 'Boarding',
      message: 'Arriving in 2m',
      accent: '#0098D4',
    });
    expect(usePillStore.getState().active?.id).toBe('dis-1');

    // Primer arrives (3) -> dropped
    usePillStore.getState().requestPill({
      kind: 'primer',
      tier: 'standard',
      id: 'prim-1',
      title: 'Primer',
      message: 'Enable alerts',
      accent: '#0A84FF',
    });
    expect(usePillStore.getState().active?.id).toBe('dis-1');

    // Recovery arrives (2) -> dropped
    usePillStore.getState().requestPill({
      kind: 'recovery',
      tier: 'compact',
      id: 'rec-1',
      title: 'Recovery',
      message: 'Good service resumed',
      accent: '#0098D4',
    });
    expect(usePillStore.getState().active?.id).toBe('dis-1');
  });

  it('tracks primer presentation counter and caps at 2 presentations', () => {
    useUserPreferencesStore.setState({ primerPillPresentationCount: 0 });
    expect(useUserPreferencesStore.getState().primerPillPresentationCount).toBe(0);

    useUserPreferencesStore.getState().incrementPrimerPillPresentationCount();
    expect(useUserPreferencesStore.getState().primerPillPresentationCount).toBe(1);

    useUserPreferencesStore.getState().incrementPrimerPillPresentationCount();
    expect(useUserPreferencesStore.getState().primerPillPresentationCount).toBe(2);
  });
});
