// utils/resolveTflStopId.ts
//
// Resolves human-readable or Hub station IDs to valid TfL NaPTAN stop-point IDs.
// Supports resolving to an array of NaPTAN IDs for stations with split platforms.

import fullStationsData from '../data/tflStationsFull.json';

// ── 1. Explicit hand-verified mappings mapping to NaPTAN arrays ──────────────────
const EXPLICIT_MAP: Record<string, string[]> = {
  // HUB → NaPTANs
  HUBBAN: ['940GZZLUBNK', '940GZZDLBNK'],       // Bank (Underground + DLR)
  HUBCAW: ['940GZZLUCYF', '940GZZLNCWY', '940GZZLUECX'], // Canary Wharf (Jubilee + DLR + Elizabeth)
  HUBWAT: ['940GZZLUWLO'],                      // Waterloo
  HUBPAD: ['940GZZLUPAD', '940GZZLUHAC'],       // Paddington (Bakerloo/District/Circle/Elizabeth + H&C/Circle)
  HUBLST: ['940GZZLULVT'],                      // Liverpool Street
  HUBVIC: ['940GZZLUVIC'],                      // Victoria
  HUBEUS: ['940GZZLUEUS', '910GEUSTON'],        // Euston (Underground + Overground)
  HUBSRA: ['940GZZLUSTD', '910GSTFD'],          // Stratford (Underground + Rail)
  HUBTCR: ['940GZZLUTCR'],                      // Tottenham Court Road
  HUBKGX: ['940GZZLUKSX'],                      // King's Cross St. Pancras
  HUBBKG: ['940GZZLUBKG', '910GBARKING'],       // Barking (Underground + Overground)
  HUBCHX: ['940GZZLUCHX'],                      // Charing Cross
  HUBEAL: ['940GZZLUEBY', '910GEALINGB'],       // Ealing Broadway (Underground + Elizabeth)
  HUBEPH: ['940GZZLUEPC'],                      // Elephant & Castle
  HUBFPK: ['940GZZLUFPK'],                      // Finsbury Park
  HUBHMS: ['940GZZLUHSD', '940GZZLUHSC'],       // Hammersmith (District/Piccadilly + H&C/Circle)
  HUBLBG: ['940GZZLULBG'],                      // London Bridge
  HUBRMD: ['940GZZLURMD', '910GRICHMND'],       // Richmond (District + Overground)
  HUBWIM: ['940GZZLUWIM'],                      // Wimbledon
  HUBZCW: ['940GZZLUCWR', '910GCNDAW'],         // Canada Water (Jubilee + Overground)
  HUBCAN: ['940GZZLUCGT', '940GZZDLCGT'],       // Canning Town (Jubilee + DLR)
  HUBCUS: ['940GZZDLCUS', '910GCUSTMHS'],       // Custom House (DLR + Elizabeth)
  HUBHHY: ['940GZZLUHAI', '910GHGHI'],          // Highbury & Islington (Victoria + Overground)
  
  // Whitechapel: 940GZZLUWPL serves all lines (District, H&C, Elizabeth, Overground)
  // No split required — single NaPTAN returns complete departures
  HUBZWL: ['940GZZLUWPL'],

  // Manual slug aliases for interchanges / common variants
  'bank':            ['940GZZLUBNK', '940GZZDLBNK'],
  'bank-monument':   ['940GZZLUBNK', '940GZZDLBNK'],
  'monument':        ['940GZZLUMMT'],
  'canary-wharf':    ['940GZZLUCYF', '940GZZLNCWY', '940GZZLUECX'],
  'london-waterloo': ['940GZZLUWLO'],
  'london-bridge':   ['940GZZLULBG'],
  'stratford':       ['940GZZLUSTD', '910GSTFD'],
  'paddington':      ['940GZZLUPAD', '940GZZLUHAC'],
  'hammersmith':     ['940GZZLUHSD', '940GZZLUHSC'],
  'euston':          ['940GZZLUEUS', '910GEUSTON'],
  'ealing-broadway': ['940GZZLUEBY', '910GEALINGB'],
  'canada-water':    ['940GZZLUCWR', '910GCNDAW'],
  'canning-town':    ['940GZZLUCGT', '940GZZDLCGT'],
  'custom-house':    ['940GZZDLCUS', '910GCUSTMHS'],
  'highbury-islington': ['940GZZLUHAI', '910GHGHI'],
  'barking':         ['940GZZLUBKG', '910GBARKING'],
  'richmond':        ['940GZZLURMD', '910GRICHMND'],
  'heathrow-t123':   ['940GZZLUHRC', '910GHTRWAPT'],
  'heathrow-t4':     ['940GZZLUHR4', '910GHTRWTM4'],
  'heathrow-t5':     ['940GZZLUHR5', '910GHTRWTM5'],
  'whitechapel':     ['940GZZLUWPL'],
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

// ── 3. Array-based Resolver ───────────────────────────────────────────────────
export function resolveTflStopIds(id: string): string[] {
  // Step 1: Direct explicit lookup (HUBs, manual aliases)
  if (EXPLICIT_MAP[id]) {
    return EXPLICIT_MAP[id];
  }

  // Step 2: Already a NaPTAN — pass through
  if (id.startsWith('940GZZ') || id.startsWith('910G')) {
    return [id];
  }

  // Step 3: Try slug-based lookup from full dataset
  const slug = toSlug(id);
  if (SLUG_TO_NAPTAN[slug]) {
    return [SLUG_TO_NAPTAN[slug]];
  }

  // Step 4: Unmapped — warn and return unchanged in array
  console.warn(`[resolveTflStopIds] unmapped station id: "${id}"`);
  return [id];
}

// ── 4. Singular Backward-Compatible Wrapper ───────────────────────────────────
export function resolveTflStopId(id: string): string {
  return resolveTflStopIds(id)[0];
}
