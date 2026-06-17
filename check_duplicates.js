const fs = require('fs');
const path = require('path');

const dataPath = '/Users/ruuuview/Desktop/my commute project folder/frontend/data/tflStationsFull.json';
const fullStationsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

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

const FULL_STATIONS = fullStationsData.map(s => {
  return {
    ...s,
    name: cleanDisplayStationName(s.name)
  };
});

const map1 = new Map();
FULL_STATIONS.forEach(s => {
  const key = s.name.toLowerCase().trim();
  if (!map1.has(key)) {
    map1.set(key, []);
  }
  map1.get(key).push(s);
});

console.log('Duplicates by lowercase trim (showing first 15):');
let count = 0;
for (const [key, list] of map1.entries()) {
  if (list.length > 1) {
    count++;
    if (count <= 15) {
      console.log(`- "${key}":`, list.map(s => `[ID: ${s.id}, Name: ${s.name}, Lines: ${s.lines?.join(',')}]`));
    }
  }
}
console.log('Total duplicate keys:', count);
