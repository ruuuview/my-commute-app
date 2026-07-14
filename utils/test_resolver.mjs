// Quick integration test for lineRoutes, networkGraph, and resolveBranch
// Run with: node --experimental-vm-modules utils/test_resolver.mjs
// But we need to handle TypeScript, so we'll just test the data shapes.

import { readFileSync } from 'fs';

const routeData = JSON.parse(readFileSync('data/tflRouteData.json', 'utf8'));

// Simply validate the data structure
console.log('=== DATA VALIDATION ===');
console.log(`Lines: ${Object.keys(routeData.routes).length}`);
console.log(`Stations: ${Object.keys(routeData.stations).length}`);

// Check some specific routes
const northern = routeData.routes.northern;
console.log('\n=== Northern Line Routes ===');
for (const dir of ['inbound', 'outbound']) {
  console.log(`\n${dir}:`);
  for (const r of northern[dir]) {
    const name = r.name.replace(/&harr;/g, '↔').trim();
    console.log(`  ${name} (${r.naptanIds.length} stops)`);
  }
}

// Check that key stations are present
const keyStations = {
  '940GZZLUCTN': 'Camden Town',
  '940GZZLUEGW': 'Edgware',
  '940GZZLUCFM': 'Chalk Farm',
  '940GZZLUHBT': 'High Barnet',
  '940GZZLUMHL': 'Mill Hill East',
};
console.log('\n=== Station Name Lookup ===');
for (const [id, expected] of Object.entries(keyStations)) {
  const found = routeData.stations[id];
  console.log(`${id}: ${found ? found.name : 'NOT FOUND'} (expected ${expected})`);
}

// Check graph connectivity
console.log('\n=== Graph Validation ===');
const allStationIds = new Set();
for (const lineId of Object.keys(routeData.routes)) {
  const line = routeData.routes[lineId];
  for (const dir of ['inbound', 'outbound']) {
    for (const r of line[dir]) {
      for (const nid of r.naptanIds) {
        allStationIds.add(nid);
      }
    }
  }
}
console.log(`Unique stations across all routes: ${allStationIds.size}`);

// Check that stations in naptanIds have a name
const unnamed = [];
for (const nid of allStationIds) {
  if (!routeData.stations[nid]) {
    unnamed.push(nid);
  }
}
if (unnamed.length > 0) {
  console.log(`WARNING: ${unnamed.length} station IDs without names (first 5: ${unnamed.slice(0,5).join(', ')})`);
} else {
  console.log('All station IDs have a name entry');
}

// Validate specific routes
console.log('\n=== Edge Count ===');
let edgeCount = 0;
for (const lineId of Object.keys(routeData.routes)) {
  const line = routeData.routes[lineId];
  for (const dir of ['inbound', 'outbound']) {
    for (const r of line[dir]) {
      edgeCount += (r.naptanIds.length - 1) * 2; // bidirectional
    }
  }
}
console.log(`Total bidirectional edges available: ${edgeCount}`);

// Print basic stats
console.log('\n=== Line Summaries ===');
for (const lineId of Object.keys(routeData.routes).sort()) {
  const line = routeData.routes[lineId];
  let totalStops = 0;
  let totalRoutes = 0;
  for (const dir of ['inbound', 'outbound']) {
    for (const r of line[dir]) {
      totalStops += r.naptanIds.length;
      totalRoutes++;
    }
  }
  const uniqueStops = new Set();
  for (const dir of ['inbound', 'outbound']) {
    for (const r of line[dir]) {
      for (const nid of r.naptanIds) uniqueStops.add(nid);
    }
  }
  console.log(`${lineId.padEnd(20)} ${totalRoutes.toString().padStart(3)} routes, ${uniqueStops.size.toString().padStart(3)} unique stations, ${totalStops} total stops`);
}

console.log('\n=== VALIDATION COMPLETE ===');
