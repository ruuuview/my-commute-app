const fs = require('fs');
const path = require('path');

const tflStationsPath = path.join(__dirname, 'tflStationsFull.json');
const csvPath = path.join(__dirname, 'doogal.csv');
const outputPath = path.join(__dirname, 'stationCoordinates.json');

const tflStations = JSON.parse(fs.readFileSync(tflStationsPath, 'utf8'));

console.log(`Found ${tflStations.length} stations in tflStationsFull.json.`);

const csvContent = fs.readFileSync(csvPath, 'utf8');
const lines = csvContent.split('\n');

const coordinates = {};

lines.forEach(line => {
  if (!line.trim()) return;

  const parts = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);

  if (parts.length >= 5) {
    const stationName = parts[0].trim();
    const lat = parseFloat(parts[3]);
    const lon = parseFloat(parts[4]);
    if (!isNaN(lat) && !isNaN(lon)) {
      coordinates[stationName.toLowerCase()] = { lat, lon };
    }
  }
});

const manualFallback = {
  "piccadilly circus": { lat: 51.510091, lon: -0.133869 },
  "plaistow": { lat: 51.5244, lon: 0.0175 },
  "pimlico": { lat: 51.4891, lon: -0.1334 },
  "pinner": { lat: 51.5928, lon: -0.3804 },
  "pontoon dock": { lat: 51.5023, lon: 0.0322 },
  "poplar": { lat: 51.5077, lon: -0.0172 },
  "preston road": { lat: 51.5720, lon: -0.2949 },
  "shadwell": { lat: 51.5117, lon: -0.0566 }
};

const stationCoords = {};
const unmatched = [];

function cleanName(name) {
  return name.toLowerCase()
    .replace(/\./g, '')
    .replace(/'/g, '')
    .replace(/’/g, '')
    .replace(/&/g, 'and')
    .replace(/\s+/g, ' ')
    .trim();
}

tflStations.forEach(station => {
  const { id, name } = station;
  let key = cleanName(name);

  // 1. Check manual fallback first
  let coord = null;
  for (const fallbackKey of Object.keys(manualFallback)) {
    if (key.includes(fallbackKey) || fallbackKey.includes(key)) {
      coord = manualFallback[fallbackKey];
      break;
    }
  }

  // 2. Direct match or clean match on CSV coordinates
  if (!coord) {
    const csvKeys = Object.keys(coordinates);
    
    // Find direct clean name match
    coord = coordinates[key] || coordinates[name.toLowerCase()];
    
    // Clean all CSV keys to find a match without apostrophes/dots/etc.
    if (!coord) {
      for (const csvKey of csvKeys) {
        if (cleanName(csvKey) === key) {
          coord = coordinates[csvKey];
          break;
        }
      }
    }
  }

  // 3. Specific heuristics/renaming
  if (!coord) {
    if (key.includes("kings cross")) {
      coord = coordinates["kings cross st. pancras"] || coordinates["kings cross st pancras"] || coordinates["king's cross st. pancras"] || coordinates["king's cross st pancras"];
    } else if (key.includes("elephant")) {
      coord = coordinates["elephant & castle"] || coordinates["elephant and castle"];
    } else if (key.includes("paddington")) {
      coord = coordinates["paddington"];
    } else if (key.includes("liverpool street")) {
      coord = coordinates["liverpool street"];
    } else if (key.includes("tottenham court road")) {
      coord = coordinates["tottenham court road"];
    } else if (key.includes("st paul")) {
      coord = coordinates["st. paul's"] || coordinates["st paul's"];
    } else if (key.includes("st james")) {
      coord = coordinates["st. james's park"] || coordinates["st james's park"];
    } else if (key.includes("highbury")) {
      coord = coordinates["highbury & islington"] || coordinates["highbury and islington"];
    } else if (key.includes("camden road")) {
      coord = coordinates["camden road"];
    } else if (key.includes("tower hill")) {
      coord = coordinates["tower hill"];
    } else if (key.includes("shepherds bush")) {
      coord = coordinates["shepherd's bush"] || coordinates["shepherds bush"];
    } else if (key.includes("golders green")) {
      coord = coordinates["golders green"];
    } else if (key.includes("hammersmith")) {
      if (key.includes("dist")) {
        coord = coordinates["hammersmith (district)"];
      } else {
        coord = coordinates["hammersmith (met.)"] || coordinates["hammersmith (district)"];
      }
    } else if (key.includes("heathrow")) {
      if (key.includes("terminal 4")) {
        coord = coordinates["heathrow terminal 4"];
      } else if (key.includes("terminal 5")) {
        coord = coordinates["heathrow terminal 5"];
      } else {
        coord = coordinates["heathrow terminals 2 and 3"] || coordinates["heathrow terminal 4"];
      }
    }
  }

  // 4. Substring matching / suffix stripping
  if (!coord) {
    const suffixes = [" underground station", " dlr station", " rail station", " station", " international"];
    for (const suffix of suffixes) {
      if (key.endsWith(suffix)) {
        const stripped = key.slice(0, -suffix.length).trim();
        coord = coordinates[stripped] || coordinates[cleanName(stripped)];
        if (coord) break;
      }
    }
  }

  // 5. Try matching if doogal name is a substring or vice versa
  if (!coord) {
    const doogalKeys = Object.keys(coordinates);
    for (const dKey of doogalKeys) {
      const cleanDKey = cleanName(dKey);
      if (cleanDKey.includes(key) || key.includes(cleanDKey)) {
        coord = coordinates[dKey];
        break;
      }
    }
  }

  if (coord) {
    stationCoords[id] = {
      id,
      name,
      lat: coord.lat,
      lon: coord.lon
    };
  } else {
    unmatched.push({ id, name });
  }
});

console.log(`Successfully matched ${Object.keys(stationCoords).length} out of ${tflStations.length} stations.`);
if (unmatched.length > 0) {
  console.log(`Unmatched stations (${unmatched.length}):`, unmatched);
}

fs.writeFileSync(
  outputPath,
  JSON.stringify(stationCoords, null, 2)
);
console.log('Wrote stationCoordinates.json');
