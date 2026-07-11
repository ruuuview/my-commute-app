const fs = require('fs');
const path = require('path');
// Removed unused execSync

console.log('--- STARTING HUB EXPANSION GENERATOR (RECURSIVE MODE) ---');

const resolveFilePath = path.join(__dirname, '../utils/resolveTflStopId.ts');

// 1. Read resolveTflStopId.ts and extract all unique HUB* codes
const content = fs.readFileSync(resolveFilePath, 'utf8');
const hubRegex = /\b(HUB[A-Z]{3})\b/g;
const hubs = new Set();
let match;
while ((match = hubRegex.exec(content)) !== null) {
  hubs.add(match[1]);
}

const hubList = Array.from(hubs).sort();
console.log(`Found ${hubList.length} unique Hub IDs to fetch:`, hubList);

const hubMap = {};

function extractIdsRecursively(obj, ids = new Set()) {
  if (!obj) return ids;
  if (typeof obj === 'string') {
    // Collect strings matching 940G* or 910G* (at least 8 chars)
    if ((obj.startsWith('940G') || obj.startsWith('910G')) && obj.length >= 8) {
      ids.add(obj);
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      extractIdsRecursively(item, ids);
    }
  } else if (typeof obj === 'object') {
    for (const key in obj) {
      extractIdsRecursively(obj[key], ids);
    }
  }
  return ids;
}

function fetchHubChildren(hubId) {
  return new Promise((resolve) => {
    try {
      const url = `https://api.tfl.gov.uk/StopPoint/${hubId}`;
      const stdout = require('child_process').execFileSync('/usr/bin/curl', ['-s', '--max-time', '15', url], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      const json = JSON.parse(stdout);
      
      const ids = extractIdsRecursively(json);
      // Remove the hub ID itself if it matches the pattern (hubs don't usually start with 940G/910G, but just in case)
      ids.delete(hubId);
      
      resolve(Array.from(ids));
    } catch (e) {
      console.error(`❌ Error fetching/parsing for ${hubId}:`, e.message);
      resolve([]);
    }
  });
}

async function run() {
  for (let i = 0; i < hubList.length; i++) {
    const hubId = hubList[i];
    console.log(`[${i + 1}/${hubList.length}] Fetching children for ${hubId} recursively...`);
    
    const children = await fetchHubChildren(hubId);
    if (children && children.length > 0) {
      // Deduplicate & sort
      const uniqueChildren = Array.from(new Set(children)).sort();
      hubMap[hubId] = uniqueChildren;
      console.log(`   ✅ Resolved ${hubId} -> ${JSON.stringify(uniqueChildren)}`);
    } else {
      console.warn(`   ⚠️ No children resolved for ${hubId}`);
    }

    // Small delay between requests (100ms)
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log('===JSON_START===');
  console.log(JSON.stringify(hubMap, null, 2));
  console.log('===JSON_END===');
}

run();
