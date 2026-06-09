const fs = require('fs');
const path = require('path');

// Read full stations data
const fullStationsPath = path.join(__dirname, 'data', 'tflStationsFull.json');
const fullStations = JSON.parse(fs.readFileSync(fullStationsPath, 'utf8'));

// Import TFL_STATIONS list from tflStations.ts
// We will parse the file since it's TypeScript. Let's extract the array elements.
const tflStationsFileContent = fs.readFileSync(path.join(__dirname, 'data', 'tflStations.ts'), 'utf8');

// A simple regex parser to extract TFL_STATIONS from the ts file
// We want to extract objects like: { id: '...', name: '...', lines: [...] }
const stationsList = [];
const regex = /\{\s*id:\s*'([^']*)',\s*name:\s*(?:"([^"]*)"|'([^']*)'),\s*lines:\s*\[([^\]]*)\]/g;
let match;
while ((match = regex.exec(tflStationsFileContent)) !== null) {
  const id = match[1];
  const name = match[2] || match[3];
  const lines = match[4].replace(/['\s]/g, '').split(',');
  stationsList.push({ id, name, lines });
}

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
  return name.trim();
}

const results = [];

// For each station in our app, find all corresponding entries in the full TfL dataset
stationsList.forEach(appStation => {
  const cleanAppName = appStation.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Find all matches in fullStations
  const matches = fullStations.filter(fsEntry => {
    const cleanFsName = cleanDisplayStationName(fsEntry.name).toLowerCase().replace(/[^a-z0-9]/g, '');
    return cleanFsName === cleanAppName || fsEntry.id === appStation.id;
  });
  
  // If there are multiple entries with different NaPTAN IDs serving the lines defined in our app
  const uniqueIds = [...new Set(matches.map(m => m.id))];
  
  if (uniqueIds.length > 1) {
    // Check if the lines defined in our app are split across these IDs
    const idLineMapping = {};
    uniqueIds.forEach(id => {
      const entry = matches.find(m => m.id === id);
      idLineMapping[id] = entry.lines;
    });
    
    results.push({
      appStationId: appStation.id,
      name: appStation.name,
      appLines: appStation.lines,
      splitMappings: idLineMapping
    });
  }
});

console.log(JSON.stringify(results, null, 2));
