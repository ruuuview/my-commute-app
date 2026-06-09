// utils/resolveTflStopId.ts
//
// Resolves human-readable or Hub station IDs to valid TfL NaPTAN stop-point IDs.
// Fallback order:
//   1. EXPLICIT_MAP  (HUB IDs, manually verified aliases)
//   2. SLUG_TO_NAPTAN (auto-built from tflStationsFull.json)
//   3. Return id unchanged + console.warn

import fullStationsData from '../data/tflStationsFull.json';

// ── 1. Explicit hand-verified mappings ────────────────────────────────────────
const EXPLICIT_MAP: Record<string, string> = {
  // HUB → NaPTAN
  HUBBAN: '940GZZLUBNK',       // Bank
  HUBCAW: '940GZZLUCYF',       // Canary Wharf (Jubilee)  ← CORRECTED from 940GZZLNCWY
  HUBWAT: '940GZZLUWLO',       // Waterloo
  HUBPAD: '940GZZLUPAD',       // Paddington
  HUBLST: '940GZZLULVT',       // Liverpool Street
  HUBVIC: '940GZZLUVIC',       // Victoria
  HUBEUS: '940GZZLUEUS',       // Euston
  HUBSRA: '940GZZLUSTD',       // Stratford
  HUBTCR: '940GZZLUTCR',       // Tottenham Court Road
  HUBKGX: '940GZZLUKSX',       // King's Cross St. Pancras
  HUBBKG: '940GZZLUBKG',       // Barking
  HUBCHX: '940GZZLUCHX',       // Charing Cross
  HUBEAL: '940GZZLUEBY',       // Ealing Broadway
  HUBEPH: '940GZZLUEPC',       // Elephant & Castle
  HUBFPK: '940GZZLUFPK',       // Finsbury Park
  HUBHMS: '940GZZLUHSD',       // Hammersmith
  HUBLBG: '940GZZLULBG',       // London Bridge
  HUBRMD: '940GZZLURMD',       // Richmond
  HUBWIM: '940GZZLUWIM',       // Wimbledon

  // Manual slug aliases for interchanges / common variants
  'bank':            '940GZZLUBNK',
  'bank-monument':   '940GZZLUBNK',
  'monument':        '940GZZLUMMT',
  'canary-wharf':    '940GZZLUCYF',
  'london-waterloo': '940GZZLUWLO',
  'london-bridge':   '940GZZLULBG',
};

// ── 2. Auto-built slug → NaPTAN map from full dataset ─────────────────────────
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const SLUG_TO_NAPTAN: Record<string, string> = {};

for (const entry of fullStationsData as { id: string; name: string }[]) {
  // Only index entries that have a 940GZZ NaPTAN id (tube/DLR stop points)
  if (entry.id.startsWith('940GZZ')) {
    const slug = toSlug(entry.name);
    // First match wins — keeps the primary stop-point per name
    if (!SLUG_TO_NAPTAN[slug]) {
      SLUG_TO_NAPTAN[slug] = entry.id;
    }
  }
}

// ── 3. Resolver ───────────────────────────────────────────────────────────────
export function resolveTflStopId(id: string): string {
  // Step 1: Direct explicit lookup (HUBs, manual aliases)
  if (EXPLICIT_MAP[id]) {
    return EXPLICIT_MAP[id];
  }

  // Step 2: Already a NaPTAN — pass through
  if (id.startsWith('940GZZ') || id.startsWith('910G')) {
    return id;
  }

  // Step 3: Try slug-based lookup from full dataset
  const slug = toSlug(id);
  if (SLUG_TO_NAPTAN[slug]) {
    return SLUG_TO_NAPTAN[slug];
  }

  // Step 4: Unmapped — warn and return unchanged
  console.warn(`[resolveTflStopId] unmapped station id: "${id}"`);
  return id;
}
