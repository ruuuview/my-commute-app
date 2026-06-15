const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'completeInterchangeDatabase.json');
const csvPath = path.join(__dirname, 'doogal.csv');
const outputPath = path.join(__dirname, 'interchangeCoordinates.json');

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

const stationMap = new Map();

Object.values(db).forEach(val => {
  if (Array.isArray(val)) {
    val.forEach(station => {
      stationMap.set(station.id, station.name);
    });
  }
});

console.log(`Found ${stationMap.size} unique interchange stations in DB.`);

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

const stationCoords = {};
const unmatched = [];

stationMap.forEach((name, id) => {
  let key = name.toLowerCase();
  let coord = coordinates[key] || coordinates[key.replace(/\./g, '')] || coordinates[key.replace(/&/g, 'and')];
  
  if (!coord) {
    if (name.includes("King's Cross")) {
      coord = coordinates["kings cross st. pancras"] || coordinates["kings cross st pancras"] || coordinates["king's cross st. pancras"] || coordinates["king's cross st pancras"];
    } else if (name.includes("Elephant")) {
      coord = coordinates["elephant & castle"] || coordinates["elephant and castle"];
    } else if (name.includes("Paddington")) {
      coord = coordinates["paddington"];
    } else if (name.includes("Liverpool Street")) {
      coord = coordinates["liverpool street"];
    } else if (name.includes("Tottenham Court Road")) {
      coord = coordinates["tottenham court road"];
    } else if (name.includes("St. Paul")) {
      coord = coordinates["st. paul's"] || coordinates["st paul's"];
    } else if (name.includes("St. James")) {
      coord = coordinates["st. james's park"] || coordinates["st james's park"];
    } else if (name.includes("Highbury")) {
      coord = coordinates["highbury & islington"] || coordinates["highbury and islington"];
    } else if (name.includes("Camden Road")) {
      coord = coordinates["camden road"];
    } else if (name.includes("Tower Hill")) {
      coord = coordinates["tower hill"];
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

console.log(`Successfully matched ${Object.keys(stationCoords).length} stations.`);
if (unmatched.length > 0) {
  console.log('Unmatched stations:', unmatched);
}

fs.writeFileSync(
  outputPath,
  JSON.stringify(stationCoords, null, 2)
);
console.log('Wrote interchangeCoordinates.json');
