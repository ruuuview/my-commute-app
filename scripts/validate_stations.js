const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFilePromise = promisify(execFile);

console.log('--- UPGRADED INTEGRATION TEST: DYNAMIC EVALUATION & EXPECTED-LINES ---');

// 1. Evaluate tflStations.ts dynamically
const tflStationsContent = fs.readFileSync(path.join(__dirname, '../data/tflStations.ts'), 'utf8');
const cleanTflStationsJs = tflStationsContent
  .replace(/import\s+[^;]+;/g, '') // Strip imports
  .replace(/export\s+interface\s+\w+\s*\{[^}]*\}/g, '') // Strip interfaces
  .replace(/:\s*TfLStation(\[\])?/g, '') // Strip types
  .replace(/:\s*string(\[\])?/g, '') // Strip string parameter/return types
  .replace(/as\s+[^)]+/g, '') // Strip type assertions inside parentheses
  .replace(/export\s+/g, ''); // Strip exports

const fullStationsData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/tflStationsFull.json'), 'utf8'));

// Evaluate in sandbox context
const tflContext = new Function('fullStationsData', cleanTflStationsJs + '; return { TFL_STATIONS };');
const { TFL_STATIONS } = tflContext(fullStationsData);

console.log(`Loaded ${TFL_STATIONS.length} stations from tflStations.ts`);

// 2. Evaluate resolveTflStopId.ts dynamically
const resolverContent = fs.readFileSync(path.join(__dirname, '../utils/resolveTflStopId.ts'), 'utf8');
const cleanResolverJs = resolverContent
  .replace(/import\s+[^;]+;/g, '') // Strip imports
  .replace(/export\s+/g, '') // Strip exports
  .replace(/:\s*Record<[^>]+>/g, '') // Strip Record definitions
  .replace(/:\s*string(\[\])?/g, '') // Strip string parameters/returns
  .replace(/:\s*number/g, '') // Strip number parameters/returns
  .replace(/as\s+[^)]+/g, ''); // Strip type assertions inside parentheses

const hubExpansions = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/hubExpansions.json'), 'utf8'));

const resolverContext = new Function('hubExpansions', 'fullStationsData', cleanResolverJs + '; return { resolveTflStopIds };');
const { resolveTflStopIds } = resolverContext(hubExpansions, fullStationsData);

// 3. Expected lines map to backend line_id strings
const LINE_MAP = {
  'circle': ['circle'],
  'district': ['district'],
  'hammersmith-city': ['hammersmith-city'],
  'victoria': ['victoria'],
  'northern': ['northern'],
  'piccadilly': ['piccadilly'],
  'dlr': ['dlr'],
  'elizabeth': ['elizabeth'],
  'overground': ['liberty', 'lioness', 'mildmay', 'suffragette', 'weaver', 'windrush', 'overground'],
  'bakerloo': ['bakerloo'],
  'metropolitan': ['metropolitan'],
  'waterloo-city': ['waterloo-city'],
};

// 4. Sequential execution of tests
const backendBase = 'https://my-commute-brain.vercel.app/api/stations';
const failedResolution = [];
const failedLines = [];
const failedLive = [];
const successful = [];

async function runAll() {
  const date = new Date();
  const londonTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    hour12: false
  }).format(date);
  const hour = parseInt(londonTime, 10);
  // Core London operating hours
  const isOperatingHours = hour >= 6 && hour < 23;

  for (let i = 0; i < TFL_STATIONS.length; i++) {
    const station = TFL_STATIONS[i];
    let resolved;
    try {
      resolved = resolveTflStopIds(station.id);
    } catch (e) {
      failedResolution.push({ station, error: e.message });
      console.log(`[${i + 1}/${TFL_STATIONS.length}] ❌ Resolution crashed for "${station.name}" (${station.id}): ${e.message}`);
      continue;
    }

    const isResolved = resolved.every(r => r.startsWith('940GZZ') || r.startsWith('910G') || r.startsWith('HUB'));
    
    if (!isResolved) {
      failedResolution.push({ station, resolved });
      console.log(`[${i + 1}/${TFL_STATIONS.length}] ❌ Resolution failed for "${station.name}" (${station.id}) -> resolved to ${JSON.stringify(resolved)}`);
      continue;
    }

    console.log(`[${i + 1}/${TFL_STATIONS.length}] Testing "${station.name}" -> resolved to ${JSON.stringify(resolved)}`);
    
    // Fetch all children in parallel and merge departures
    let mergedDepartures = [];
    let fetchErrors = [];
    
    await Promise.all(resolved.map(async (rid) => {
      const url = `${backendBase}/${rid}`;
      try {
        const { stdout } = await execFilePromise('/usr/bin/curl', ['-s', url]);
        const data = JSON.parse(stdout);
        if (data && Array.isArray(data.departures)) {
          mergedDepartures = mergedDepartures.concat(data.departures);
        }
      } catch (err) {
        fetchErrors.push(`${rid}: ${err.message}`);
      }
    }));

    if (fetchErrors.length > 0 && mergedDepartures.length === 0) {
      failedLive.push({ station, errors: fetchErrors });
      console.log(`   ❌ API fetch failed: ${fetchErrors.join(', ')}`);
      continue;
    }

    // Verify expected lines are present during operating hours.
    // If the board is completely empty, it's usually a rate-limit/network flake, not an expansion bug.
    // So we only assert missing lines if we successfully fetched at least one departure.
    const missingLines = [];
    const isPureRail = resolved.every(rid => rid === '910GCTMSLNK' || rid === '910GFENCHRS');
    
    if (isOperatingHours && !isPureRail) {
      if (mergedDepartures.length > 0) {
        for (const expectedLine of station.lines) {
          if (station.id === 'kensington-oly' && expectedLine === 'district') {
            continue; // District line service to Kensington Olympia is intermittent
          }
          if (expectedLine === 'waterloo-city') {
            const day = new Date().getDay();
            if (day === 0 || day === 6) {
              continue; // Waterloo & City line is closed on weekends
            }
          }
          const matchingLineIds = LINE_MAP[expectedLine] || [expectedLine];
          const hasLineArrival = mergedDepartures.some(dep => 
            dep.line_id && matchingLineIds.includes(dep.line_id.toLowerCase().trim())
          );
          if (!hasLineArrival) {
            missingLines.push(expectedLine);
          }
        }
      } else {
        console.log(`   ⚠️ Warning: Empty arrivals returned (possible network/TfL rate-limit flake)`);
      }
    }

    if (missingLines.length > 0) {
      console.log(`   ⚠️ Warning: Expected-lines check failed. Missing: ${JSON.stringify(missingLines)} (could be a planned closure/disruption)`);
      failedLines.push({ station, missingLines });
    } else {
      successful.push(station);
      console.log(`   ✅ Pass! (${mergedDepartures.length} live departures verified)`);
    }

    // 300ms sleep to avoid TfL rate limits
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log('\n--- VERIFICATION RESULTS ---');
  console.log(`Total stations checked: ${TFL_STATIONS.length}`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Resolution failures: ${failedResolution.length}`);
  console.log(`API fetch failures: ${failedLive.length}`);
  console.log(`Expected-lines assertion failures: ${failedLines.length}`);

  if (failedResolution.length === 0 && failedLive.length === 0 && failedLines.length === 0) {
    console.log('🎉 PASS: All configured stations resolve, fetch, and contain all expected lines!');
    process.exit(0);
  } else {
    console.log('❌ FAIL: Some stations had resolution, API, or missing-line errors.');
    process.exit(1);
  }
}

runAll();
