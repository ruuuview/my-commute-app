import fs from 'fs';
import path from 'path';
import { useOnboardingStore } from '../store/onboardingStore';
import { useUserPreferencesStore } from '../store/userPreferencesStore';

describe('Onboarding Screen 2: Station Search & Selection Invariants', () => {
  const stationsScreenPath = path.resolve(__dirname, '../app/onboarding/stations.tsx');

  beforeEach(() => {
    useOnboardingStore.setState({
      selectedLines: ['victoria'],
      pinnedStations: [],
    });
  });

  test('stations.tsx source exists and has zero legacy background hexes', () => {
    expect(fs.existsSync(stationsScreenPath)).toBe(true);
    const content = fs.readFileSync(stationsScreenPath, 'utf8');

    expect(content).not.toMatch(/backgroundColor:\s*['"]#0A0F3C['"]/i);
    expect(content).not.toMatch(/backgroundColor:\s*['"]#0A163A['"]/i);
    expect(content).not.toMatch(/backgroundColor:\s*['"]#030818['"]/i);
  });

  test('stations.tsx auto-clears query and search mode upon station add in handleToggleStation', () => {
    const content = fs.readFileSync(stationsScreenPath, 'utf8');

    // Must reset query, isSearching, and isFocused when adding station
    expect(content).toContain("setQuery('')");
    expect(content).toContain('setIsSearching(false)');
    expect(content).toContain('setIsFocused(false)');

    // Must call Keyboard.dismiss() and blur input on toggle
    expect(content).toContain('Keyboard.dismiss()');
    expect(content).toContain('inputRef.current?.blur()');
  });

  test('stations.tsx includes Cancel button with handleCancelSearch for explicit search dismissal', () => {
    const content = fs.readFileSync(stationsScreenPath, 'utf8');

    expect(content).toContain('handleCancelSearch');
    expect(content).toContain('searchCancelBtn');
    expect(content).toContain('searchCancelText');
    expect(content).toContain('Cancel');
  });

  test('stations.tsx clear icon keeps input focus instead of killing search mode', () => {
    const content = fs.readFileSync(stationsScreenPath, 'utf8');

    // When tapping close-circle clear icon, it clears query and keeps focus
    expect(content).toContain('inputRef.current?.focus()');
  });

  test('stations.tsx provides section header and Add Another Station footer on the pinned deck', () => {
    const content = fs.readFileSync(stationsScreenPath, 'utf8');

    expect(content).toContain('YOUR PINNED STATIONS');
    expect(content).toContain('addAnotherCard');
    expect(content).toContain('Add destination (e.g. Work)');
    expect(content).toContain('Add another station');
  });

  test('stations.tsx renders removeCircle for pinned items on the main deck', () => {
    const content = fs.readFileSync(stationsScreenPath, 'utf8');

    expect(content).toContain('removeCircle');
  });

  test('OnboardingStore station addition enables canContinue invariant', () => {
    expect(useOnboardingStore.getState().pinnedStations.length).toBe(0);

    useOnboardingStore.getState().addStation({
      id: '940GZZLUVIC',
      name: 'Victoria',
      lineIds: ['victoria', 'district', 'circle'],
      zone: 1,
    });

    const pinned = useOnboardingStore.getState().pinnedStations;
    expect(pinned.length).toBe(1);
    expect(pinned[0].id).toBe('940GZZLUVIC');

    // Adding second station sets up home + work corridor
    useOnboardingStore.getState().addStation({
      id: '940GZZLUOXC',
      name: 'Oxford Circus',
      lineIds: ['victoria', 'central', 'bakerloo'],
      zone: 1,
    });

    expect(useOnboardingStore.getState().pinnedStations.length).toBe(2);

    // Unpinning removes station cleanly
    useOnboardingStore.getState().removeStation('940GZZLUVIC');
    expect(useOnboardingStore.getState().pinnedStations.length).toBe(1);
    expect(useOnboardingStore.getState().pinnedStations[0].id).toBe('940GZZLUOXC');
  });
});
