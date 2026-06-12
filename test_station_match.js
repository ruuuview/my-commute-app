const fs = require('fs');
const path = require('path');

// Load full stations dataset
const fullStationsPath = path.resolve(__dirname, './data/tflStationsFull.json');
const fullStations = JSON.parse(fs.readFileSync(fullStationsPath, 'utf8'));

// Suffix stripping logic similar to cleanDisplayStationName in tflStations.ts
const STRIP_SUFFIXES = [
  ' Elizabeth line Station',
  ' Underground Station',
  ' Overground Station',
  ' DLR Station',
  ' Rail Station',
  ' Station',
];

function cleanDisplayStationName(raw) {
  let name = raw;
  for (const suffix of STRIP_SUFFIXES) {
    if (name.endsWith(suffix)) {
      name = name.slice(0, -suffix.length);
      break;
    }
  }
  name = name.replace(/-(Underground|DLR|Overground)$/i, '');
  name = name.replace(/\s*\([^)]*\b(Line|DLR|for |Berks|London)\b[^)]*\)/gi, '');
  name = name.replace(/\s*\((Bakerloo|Central|Circle|District|Hammersmith|Metropolitan|Northern|Jubilee|Piccadilly|Victoria|Elizabeth|Overground|DLR)\)/gi, '');
  for (const suffix of STRIP_SUFFIXES) {
    if (name.endsWith(suffix)) {
      name = name.slice(0, -suffix.length);
      break;
    }
  }
  name = name.trim();
  if (name.endsWith('.')) {
    name = name.slice(0, -1);
  }
  return name.trim();
}

// Clean stations
const cleanFullStations = [];
const map = {};
for (const st of fullStations) {
  const cleanName = cleanDisplayStationName(st.name);
  const key = cleanName.toLowerCase().trim();
  if (!map[key]) {
    const cleanSt = { ...st, name: cleanName };
    map[key] = cleanSt;
    cleanFullStations.push(cleanSt);
  }
}

// Define the updated popular names list
const POPULAR_NAMES = ['bank', 'canary wharf', "king's cross st. pancras", 'waterloo', 'liverpool street'];

console.log("Running matching tests...\n");

const matched = [];
for (const st of cleanFullStations) {
  const stName = st.name.toLowerCase();
  const isPopular = POPULAR_NAMES.some(pName => stName.includes(pName));
  if (isPopular) {
    matched.push(st.name);
  }
}

console.log("Matched Popular Stations:", matched);

// Check if King's Cross St. Pancras was matched
const hasKingsCross = matched.some(name => name.includes("King's Cross"));
if (hasKingsCross) {
  console.log("\n[SUCCESS] King's Cross St. Pancras matched successfully!");
} else {
  console.error("\n[FAILURE] King's Cross St. Pancras was NOT matched!");
  process.exit(1);
}
