const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);

console.log('--- COMMITTED INTEGRATION TEST: STATION RESOLUTION & LIVE API ---');

// 1. Load data
const tflStationsContent = fs.readFileSync(path.join(__dirname, '../data/tflStations.ts'), 'utf8');
const fullStationsData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/tflStationsFull.json'), 'utf8'));

// Parse TFL_STATIONS ids and names
const idRegex = /id:\s*'([^']+)'/g;
const nameRegex = /name:\s*["']([^"']+)["']/g;

const stationIds = [];
let idMatch;
while ((idMatch = idRegex.exec(tflStationsContent)) !== null) {
  stationIds.push(idMatch[1]);
}

const stationNames = [];
let nameMatch;
while ((nameMatch = nameRegex.exec(tflStationsContent)) !== null) {
  stationNames.push(nameMatch[1]);
}

// Pair them up
const stations = stationIds.map((id, index) => ({
  id,
  name: stationNames[index] || id
}));

console.log(`Loaded ${stations.length} stations from tflStations.ts`);

// 2. Build resolver maps (reproducing resolveTflStopId.ts logic)
const resolverContent = fs.readFileSync(path.join(__dirname, '../utils/resolveTflStopId.ts'), 'utf8');

function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const SLUG_TO_NAPTAN = {};
for (const entry of fullStationsData) {
  if (entry.id.startsWith('940GZZ') || entry.id.startsWith('910G')) {
    const slug = toSlug(entry.name);
    const existing = SLUG_TO_NAPTAN[slug];
    if (!existing) {
      SLUG_TO_NAPTAN[slug] = entry.id;
    } else {
      if (existing.startsWith('910G') && entry.id.startsWith('940GZZ')) {
        SLUG_TO_NAPTAN[slug] = entry.id;
      }
    }
  }
}

// Extract SLUG_TO_HUB map
const slugToHubMatch = resolverContent.match(/const SLUG_TO_HUB: Record<string, string> = \{([\s\S]*?)\};/);
const SLUG_TO_HUB = {};
if (slugToHubMatch) {
  const lines = slugToHubMatch[1].split('\n');
  for (let line of lines) {
    line = line.trim();
    if (line && line.includes(':')) {
      const parts = line.split(':');
      const k = parts[0].trim().replace(/['"]/g, '');
      const v = parts[1].trim().replace(/['",]/g, '');
      SLUG_TO_HUB[k] = v;
    }
  }
}

// Extract EXPLICIT_MAP
const explicitMapMatch = resolverContent.match(/const EXPLICIT_MAP: Record<string, string\[\]> = \{([\s\S]*?)\};/);
const EXPLICIT_MAP = {};
if (explicitMapMatch) {
  const lines = explicitMapMatch[1].split('\n');
  for (let line of lines) {
    line = line.trim();
    if (line && line.includes(':')) {
      const parts = line.split(':');
      const k = parts[0].trim().replace(/['"]/g, '');
      const arrStr = parts[1].trim();
      const arr = (arrStr.match(/['"]([^'"]+)['"]/g) || []).map(x => x.replace(/['"]/g, ''));
      EXPLICIT_MAP[k] = arr;
    }
  }
}

function resolveTflStopIds(id) {
  if (id.startsWith('HUB') || id.startsWith('940GZZ') || id.startsWith('910G')) {
    return [id];
  }
  const slug = toSlug(id);
  if (EXPLICIT_MAP[slug]) return EXPLICIT_MAP[slug];
  if (EXPLICIT_MAP[id]) return EXPLICIT_MAP[id];
  if (SLUG_TO_NAPTAN[slug]) return [SLUG_TO_NAPTAN[slug]];
  return [id];
}

// 3. Verification using sequential execution
const backendBase = 'https://my-commute-brain.vercel.app/api/stations';
const failedResolution = [];
const failedLive = [];
const successful = [];

const tasks = [];
for (const station of stations) {
  const resolved = resolveTflStopIds(station.id);
  const isResolved = resolved.every(r => r.startsWith('940GZZ') || r.startsWith('910G') || r.startsWith('HUB'));
  if (!isResolved) {
    failedResolution.push({ station, resolved });
    console.log(`❌ Resolution failed for "${station.name}" (${station.id}) -> resolved to ${JSON.stringify(resolved)}`);
    continue;
  }
  for (const rid of resolved) {
    tasks.push({ station, rid });
  }
}

async function runAllTasks() {
  for (let i = 0; i < tasks.length; i++) {
    const { station, rid } = tasks[i];
    const url = `${backendBase}/${rid}`;

    const date = new Date();
    const londonTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      hour: '2-digit',
      hour12: false
    }).format(date);
    const hour = parseInt(londonTime, 10);
    // Core London operating hours
    const isOperatingHours = hour >= 6 && hour < 23;

    try {
      const { stdout } = await execPromise(`curl -s "${url}"`);
      const data = JSON.parse(stdout);
      if (!data || typeof data !== 'object' || !('departures' in data)) {
        throw new Error("Invalid response format: missing 'departures' property");
      }
      const count = (data.departures || []).length;
      if (count === 0 && isOperatingHours) {
        const isPureRail = rid === '910GCTMSLNK' || rid === '910GFENCHRS';
        if (!isPureRail) {
          throw new Error(`Empty departures list returned during operating hours (${londonTime}:00 London time)`);
        }
      }
      successful.push({ station, rid, count });
      console.log(`[${i + 1}/${tasks.length}] ✅ "${station.name}" -> "${rid}" works (${count} live departures)`);
    } catch (err) {
      failedLive.push({ station, rid, url, error: err.message });
      console.log(`[${i + 1}/${tasks.length}] ❌ "${station.name}" -> "${rid}" failed: ${err.message}`);
    }

    // 250ms sleep to avoid TfL API rate-limiting
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  console.log('\n--- VERIFICATION RESULTS ---');
  console.log(`Total checked combinations: ${tasks.length}`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Resolution failures: ${failedResolution.length}`);
  console.log(`Live API failures: ${failedLive.length}`);

  if (failedResolution.length === 0 && failedLive.length === 0) {
    console.log('✅ PASS: All configured stations resolve and return valid departures from the live API!');
    process.exit(0);
  } else {
    console.log('❌ FAIL: Some stations have configuration or API errors.');
    process.exit(1);
  }
}

runAllTasks();
