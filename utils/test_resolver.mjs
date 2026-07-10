#!/usr/bin/env node
// Quick test for resolveTflStopIds HUB expansion fix
// Run: node utils/test_resolver_fix.mjs

import { resolveTflStopIds, resolveTflStopIdForStore } from '../utils/resolveTflStopId.ts';

const HUB_TESTS = [
  ['HUBCAW', 3],   // Canary Wharf → Jubilee + DLR + Lizzie
  ['HUBBAN', 2],   // Bank → Underground + DLR
  ['HUBWAT', 1],   // Waterloo → Underground
  ['HUBPAD', 2],   // Paddington → 2 NaPTANs
  ['HUBKGX', 1],   // King's Cross
  ['HUBVXH', 1],   // Vauxhall
  ['HUBHHY', 2],   // Highbury & Islington
  ['HUBLBG', 1],   // London Bridge
  ['HUBRMD', 2],   // Richmond
  ['HUBSRA', 2],   // Stratford
];

let passed = 0;
let failed = 0;

for (const [hub, expected] of HUB_TESTS) {
  const result = resolveTflStopIds(hub);
  if (result.length === expected) {
    console.log(`✅ ${hub} → ${result.length} NaPTANs: ${result.join(', ')}`);
    passed++;
  } else {
    console.log(`❌ ${hub} → expected ${expected} NaPTANs, got ${result.length}: ${result.join(', ')}`);
    failed++;
  }
}

// Test slug → NaPTAN still works
const SLUG_TESTS = [
  ['canary-wharf', 3],
  ['bank', 2],
  ['kings-cross', 1],
  ['london-bridge', 1],
  ['paddington', 2],
];

for (const [slug, expected] of SLUG_TESTS) {
  const result = resolveTflStopIds(slug);
  if (result.length === expected) {
    console.log(`✅ ${slug} → ${result.length} NaPTANs`);
    passed++;
  } else {
    console.log(`❌ ${slug} → expected ${expected} NaPTANs, got ${result.length}`);
    failed++;
  }
}

// Test store resolver
const STORE_TESTS = [
  ['canary-wharf', 'HUBCAW'],
  ['bank', 'HUBBAN'],
  ['kings-cross', '940GZZLUKSX'],
  ['King\'s Cross St. Pancras', '940GZZLUKSX'],
  ['St. Paul\'s', '940GZZLUSPU'],
];

for (const [input, expected] of STORE_TESTS) {
  const result = resolveTflStopIdForStore(input);
  if (result === expected) {
    console.log(`✅ store: "${input}" → ${result}`);
    passed++;
  } else {
    console.log(`❌ store: "${input}" → ${result} (expected ${expected})`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
