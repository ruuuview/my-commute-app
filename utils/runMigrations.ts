import { resolveTflStopIdForStore } from './resolveTflStopId';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { useOnboardingStore } from '../store/onboardingStore';

export function runMigrations() {
  const prefStore = useUserPreferencesStore.getState();
  const onboardingStore = useOnboardingStore.getState();

  const currentVersion = prefStore.schemaVersion || 0;
  let migrationNeeded = false;

  if (currentVersion < 2) {
    console.log(`[Migration] Running store migration from schema version ${currentVersion} to 2`);
    migrationNeeded = true;
  }

  // Migrate user preferences pinned stations
  let prefChanged = false;
  let migratedPinned = prefStore.pinnedStations || [];
  let migratedRecent = prefStore.recentSearches || [];

  if (migrationNeeded) {
    migratedPinned = (prefStore.pinnedStations || []).map(station => {
      if (station && typeof station.id === 'string') {
        const resolved = resolveTflStopIdForStore(station.id);
        if (resolved && resolved !== station.id) {
          prefChanged = true;
          console.log(`[Migration] Pinned station ID "${station.id}" migrated to "${resolved}"`);
          return { ...station, id: resolved };
        }
      }
      return station;
    });

    migratedRecent = (prefStore.recentSearches || []).map(id => {
      if (id && typeof id === 'string') {
        const resolved = resolveTflStopIdForStore(id);
        if (resolved && resolved !== id) {
          prefChanged = true;
          console.log(`[Migration] Recent search ID "${id}" migrated to "${resolved}"`);
          return resolved;
        }
      }
      return id;
    });
  }

  if (prefChanged) {
    useUserPreferencesStore.setState({
      pinnedStations: migratedPinned,
      recentSearches: migratedRecent,
    });
  }

  // Migrate onboarding store pinned stations
  let onboardingChanged = false;
  let migratedOnboarding = onboardingStore.pinnedStations || [];

  if (migrationNeeded) {
    migratedOnboarding = (onboardingStore.pinnedStations || []).map(station => {
      if (station && typeof station.id === 'string') {
        const resolved = resolveTflStopIdForStore(station.id);
        if (resolved && resolved !== station.id) {
          onboardingChanged = true;
          console.log(`[Migration] Onboarding pinned station ID "${station.id}" migrated to "${resolved}"`);
          return { ...station, id: resolved };
        }
      }
      return station;
    });
  }

  if (onboardingChanged) {
    useOnboardingStore.setState({
      pinnedStations: migratedOnboarding
    });
  }

  // Update schemaVersion to 2 only if a migration was needed
  if (migrationNeeded) {
    useUserPreferencesStore.setState({ schemaVersion: 2 });
    console.log('[Migration] Store migration to version 2 complete.');
  }
}
