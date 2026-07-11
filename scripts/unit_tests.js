const fs = require('fs');
const path = require('path');

console.log('--- RUNNING FRONTEND UNIT TESTS: STORE MIGRATIONS ---');

// Mock Zustand store states
const mockUserPreferencesStore = {
  state: {
    schemaVersion: 0,
    pinnedStations: [
      { id: "King's Cross St. Pancras", name: "King's Cross St. Pancras", lines: [], zone: 1, role: 'home' },
      { id: 'canary-wharf', name: 'Canary Wharf', lines: [], zone: 2, role: 'work' },
      { id: 'invalid-station-id', name: 'Unresolved Station', lines: [], zone: 3, role: 'other' },
      { id: 'canary-wharf', name: 'Duplicate CW', lines: [], zone: 2, role: 'other' } // duplicate
    ],
    recentSearches: [
      'kings-cross',
      'canary-wharf',
      'invalid-search',
      'canary-wharf', // duplicate to test Set
      'kings-cross' // duplicate to test Set
    ]
  },
  setState(updates) {
    this.state = { ...this.state, ...updates };
  },
  getState() {
    return this.state;
  }
};

const mockOnboardingStore = {
  state: {
    pinnedStations: [
      { id: "King's Cross St. Pancras", name: "King's Cross St. Pancras", lines: [], zone: 1, role: 'home' },
      { id: 'canary-wharf', name: 'Canary Wharf', lines: [], zone: 2, role: 'work' }
    ]
  },
  setState(updates) {
    this.state = { ...this.state, ...updates };
  },
  getState() {
    return this.state;
  }
};

// Evaluate resolveTflStopId.ts dynamically
const resolverContent = fs.readFileSync(path.join(__dirname, '../utils/resolveTflStopId.ts'), 'utf8');

const cleanResolverJs = resolverContent
  .replace(/import\s+[^;]+;/g, '') // Strip imports
  .replace(/export\s+/g, '') // Strip exports
  .replace(/:\s*Record<[^>]+>/g, '') // Strip Record definitions
  .replace(/:\s*string(\[\])?/g, '') // Strip string parameters/returns
  .replace(/:\s*number/g, '') // Strip number parameters/returns
  .replace(/as\s+[^)]+/g, ''); // Strip type assertions inside parentheses

const hubExpansions = {}; // mock empty for runMigrations scope
const fullStationsData = []; // mock empty for runMigrations scope
const resolverContext = new Function('hubExpansions', 'fullStationsData', cleanResolverJs + '; return { resolveTflStopIdForStore };');
const { resolveTflStopIdForStore } = resolverContext(hubExpansions, fullStationsData);

// Replicated runMigrations using the mocks
// Replicated runMigrations using the mocks
function runMigrationsTest() {
  const prefStore = mockUserPreferencesStore.getState();
  const onboardingStore = mockOnboardingStore.getState();

  const currentVersion = prefStore.schemaVersion || 0;
  let migrationNeeded = false;

  if (currentVersion < 2) {
    migrationNeeded = true;
  }

  // Migrate user preferences pinned stations
  let prefChanged = false;
  let migratedPinned = prefStore.pinnedStations || [];
  let migratedRecent = prefStore.recentSearches || [];

  if (migrationNeeded) {
    const seenPrefPinned = new Set();
    migratedPinned = (prefStore.pinnedStations || []).map(station => {
      if (station && typeof station.id === 'string') {
        const resolved = resolveTflStopIdForStore(station.id);
        if (resolved && resolved !== station.id) {
          prefChanged = true;
          return { ...station, id: resolved };
        }
      }
      return station;
    }).filter(station => {
      if (!station || !station.id) return true;
      if (seenPrefPinned.has(station.id)) {
        prefChanged = true;
        return false;
      }
      seenPrefPinned.add(station.id);
      return true;
    });

    const seenRecent = new Set();
    migratedRecent = (prefStore.recentSearches || []).map(id => {
      if (id && typeof id === 'string') {
        const resolved = resolveTflStopIdForStore(id);
        if (resolved && resolved !== id) {
          prefChanged = true;
          return resolved;
        }
      }
      return id;
    }).filter(id => {
      if (!id) return true;
      if (seenRecent.has(id)) {
        prefChanged = true;
        return false;
      }
      seenRecent.add(id);
      return true;
    });
  }

  if (prefChanged) {
    mockUserPreferencesStore.setState({
      pinnedStations: migratedPinned,
      recentSearches: migratedRecent,
    });
  }

  // Migrate onboarding store pinned stations
  let onboardingChanged = false;
  let migratedOnboarding = onboardingStore.pinnedStations || [];

  if (migrationNeeded) {
    const seenOnboardingPinned = new Set();
    migratedOnboarding = (onboardingStore.pinnedStations || []).map(station => {
      if (station && typeof station.id === 'string') {
        const resolved = resolveTflStopIdForStore(station.id);
        if (resolved && resolved !== station.id) {
          onboardingChanged = true;
          return { ...station, id: resolved };
        }
      }
      return station;
    }).filter(station => {
      if (!station || !station.id) return true;
      if (seenOnboardingPinned.has(station.id)) {
        onboardingChanged = true;
        return false;
      }
      seenOnboardingPinned.add(station.id);
      return true;
    });
  }

  if (onboardingChanged) {
    mockOnboardingStore.setState({
      pinnedStations: migratedOnboarding
    });
  }

  // Update schemaVersion to 2 only if a migration was needed
  if (migrationNeeded) {
    mockUserPreferencesStore.setState({ schemaVersion: 2 });
  }
}

// Run the migration test
runMigrationsTest();

const finalPrefs = mockUserPreferencesStore.getState();
const finalOnboarding = mockOnboardingStore.getState();

let failed = false;

// Assertion 1: King's Cross St. Pancras mixed case ID resolves to 940GZZLUKSX
const kcStation = finalPrefs.pinnedStations.find(s => s.name === "King's Cross St. Pancras");
if (kcStation && kcStation.id === '940GZZLUKSX') {
  console.log("✅ PASS: Pinned station 'King's Cross St. Pancras' ID migrated to canonical '940GZZLUKSX'");
} else {
  console.log("❌ FAIL: Pinned station 'King's Cross St. Pancras' ID is:", kcStation ? kcStation.id : 'missing');
  failed = true;
}

// Assertion 2: canary-wharf slug ID resolves to HUBCAW (preserving all lines)
const cwStation = finalPrefs.pinnedStations.find(s => s.name === "Canary Wharf");
if (cwStation && cwStation.id === 'HUBCAW') {
  console.log("✅ PASS: Pinned station 'canary-wharf' ID migrated to Hub 'HUBCAW'");
} else {
  console.log("❌ FAIL: Pinned station 'canary-wharf' ID is:", cwStation ? cwStation.id : 'missing');
  failed = true;
}

// Assertion 3: Unresolved legacy ID is kept (no deletion/filtering)
const unresolvedStation = finalPrefs.pinnedStations.find(s => s.name === "Unresolved Station");
if (unresolvedStation && unresolvedStation.id === 'invalid-station-id') {
  console.log("✅ PASS: Unresolved legacy ID 'invalid-station-id' was kept to prevent data loss");
} else {
  console.log("❌ FAIL: Unresolved legacy ID was modified or deleted");
  failed = true;
}

// Assertion 4: Recent searches are migrated correctly
if (finalPrefs.recentSearches[0] === '940GZZLUKSX' && finalPrefs.recentSearches[1] === 'HUBCAW' && finalPrefs.recentSearches[2] === 'invalid-search') {
  console.log("✅ PASS: Recent searches migrated successfully and unresolvable items kept");
} else {
  console.log("❌ FAIL: Recent searches migration result:", finalPrefs.recentSearches);
  failed = true;
}

// Assertion 5: Onboarding pinned stations are migrated correctly
const obKC = finalOnboarding.pinnedStations.find(s => s.name === "King's Cross St. Pancras");
const obCW = finalOnboarding.pinnedStations.find(s => s.name === "Canary Wharf");
if (obKC && obKC.id === '940GZZLUKSX' && obCW && obCW.id === 'HUBCAW') {
  console.log("✅ PASS: Onboarding store stations migrated successfully");
} else {
  console.log("❌ FAIL: Onboarding store migration result:", finalOnboarding.pinnedStations);
  failed = true;
}

// Assertion 6: Idempotency is preserved (schemaVersion is 2)
if (finalPrefs.schemaVersion === 2) {
  console.log("✅ PASS: Migration schemaVersion updated to 2");
} else {
  console.log("❌ FAIL: schemaVersion was not updated to 2, it is: " + finalPrefs.schemaVersion);
  failed = true;
}

if (failed) {
  console.log("\n❌ FRONTEND UNIT TESTS FAILED!");
  process.exit(1);
} else {
  console.log("\n✅ SUCCESS: ALL FRONTEND UNIT TESTS PASSED!");
  process.exit(0);
}
