import { TFL_STATIONS } from '../data/tflStations';
import { resolveTflStopIds } from '../utils/resolveTflStopId';

console.log('--- Checking Station ID Resolution ---');
let failedCount = 0;

for (const station of TFL_STATIONS) {
  const resolved = resolveTflStopIds(station.id);
  const isValid = resolved.every(id => id.startsWith('940GZZ') || id.startsWith('910G') || id.startsWith('HUB'));
  if (!isValid) {
    console.log(`❌ Station "${station.name}" (id: "${station.id}") resolved to invalid ID:`, resolved);
    failedCount++;
  } else {
    // console.log(`✅ Station "${station.name}" ->`, resolved);
  }
}

if (failedCount === 0) {
  console.log('✅ ALL STATIONS RESOLVED CORRECTLY TO VALID NAPTAN/HUB CODES!');
} else {
  console.log(`⚠️ ${failedCount} stations failed resolution!`);
}
