import { resolveTflStopIdForStore } from './resolveTflStopId';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { useOnboardingStore } from '../store/onboardingStore';

export function runMigrations() {
  const prefStore = useUserPreferencesStore.getState();
  const onboardingStore = useOnboardingStore.getState();

  const currentVersion = prefStore.schemaVersion || 0;
  let migrationNeeded = false;

  if (currentVersion < 1) {
    console.log(`[Migration] Running store migration from schema version ${currentVersion} to 1`);
    migrationNeeded = true;
  }

  // Migrate user preferences pinned stations — always run (idempotent)
  let prefChanged = false;
  const migratedPinned = (prefStore.pinnedStations || []).map(station => {
    if (station && typeof station.id === 'string' && !station.id.startsWith('940GZZ') && !station.id.startsWith('910G') && !station.id.startsWith('HUB')) {
      const resolved = resolveTflStopIdForStore(station.id);
      if (resolved && resolved !== station.id) {
        prefChanged = true;
        console.log(`[Migration] Pinned station ID "${station.id}" migrated to "${resolved}"`);
        return { ...station, id: resolved };
      } else {
        console.warn(`[Migration] WARNING: Legacy pinned station ID "${station.id}" could not be resolved. Keeping raw ID.`);
      }
    }
    return station;
  });

  // Migrate recent searches
  const migratedRecent = (prefStore.recentSearches || []).map(id => {
    if (id && typeof id === 'string' && !id.startsWith('940GZZ') && !id.startsWith('910G') && !id.startsWith('HUB')) {
      const resolved = resolveTflStopIdForStore(id);
      if (resolved && resolved !== id) {
        prefChanged = true;
        console.log(`[Migration] Recent search ID "${id}" migrated to "${resolved}"`);
        return resolved;
      } else {
        console.warn(`[Migration] WARNING: Legacy recent search ID "${id}" could not be resolved. Keeping raw ID.`);
      }
    }
    return id;
  });

  if (prefChanged) {
    useUserPreferencesStore.setState({
      pinnedStations: migratedPinned,
      recentSearches: migratedRecent,
    });
  }

  // Migrate onboarding store pinned stations — runs independently of pref version (idempotent)
  let onboardingChanged = false;
  const migratedOnboarding = (onboardingStore.pinnedStations || []).map(station => {
    if (station && typeof station.id === 'string' && !station.id.startsWith('940GZZ') && !station.id.startsWith('910G') && !station.id.startsWith('HUB')) {
      const resolved = resolveTflStopIdForStore(station.id);
      if (resolved && resolved !== station.id) {
        onboardingChanged = true;
        console.log(`[Migration] Onboarding pinned station ID "${station.id}" migrated to "${resolved}"`);
        return { ...station, id: resolved };
      } else {
        console.warn(`[Migration] WARNING: Legacy onboarding station ID "${station.id}" could not be resolved. Keeping raw ID.`);
      }
    }
    return station;
  });

  if (onboardingChanged) {
    useOnboardingStore.setState({
      pinnedStations: migratedOnboarding
    });
  }

  // Update schemaVersion to 1 only if a migration was needed
  if (migrationNeeded) {
    useUserPreferencesStore.setState({ schemaVersion: 1 });
    console.log('[Migration] Store migration to version 1 complete.');
  }
}
