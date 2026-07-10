// utils/resolveTflStopId.ts
//
// Resolves human-readable or Hub station IDs to valid TfL NaPTAN stop-point IDs.
// Supports resolving to an array of NaPTAN IDs for stations with split platforms.

import fullStationsData from '../data/tflStationsFull.json';

// ── 1. Explicit hand-verified mappings mapping to NaPTAN arrays ──────────────────
const EXPLICIT_MAP: Record<string, string[]> = {
  // HUB → NaPTANs
  HUBBAN: ['940GZZLUBNK', '940GZZDLBNK'],       // Bank (Underground + DLR)
  HUBCAW: ['940GZZLUCYF', '940GZZDLCAN', '910GCANWHRF'], // Canary Wharf (Jubilee + DLR + Elizabeth)
  HUBWAT: ['940GZZLUWLO'],                      // Waterloo
  HUBPAD: ['940GZZLUPAD', '940GZZLUHAC'],       // Paddington (Bakerloo/District/Circle/Elizabeth + H&C/Circle)
  HUBLST: ['940GZZLULVT', '910GLIVST'],       // Liverpool Street
  HUBVIC: ['940GZZLUVIC'],                      // Victoria
  HUBEUS: ['940GZZLUEUS', '910GEUSTON'],        // Euston (Underground + Overground)
  HUBSRA: ['940GZZLUSTD', '910GSTFD'],          // Stratford (Underground + Rail)
  HUBTCR: ['940GZZLUTCR', '910GTOTCTRD'],       // Tottenham Court Road
  HUBKGX: ['940GZZLUKSX'],                      // King's Cross St. Pancras
  HUBBKG: ['940GZZLUBKG', '910GBARKING'],       // Barking (Underground + Overground)
  HUBCHX: ['940GZZLUCHX'],                      // Charing Cross
  HUBEAL: ['940GZZLUEBY', '910GEALINGB'],       // Ealing Broadway (Underground + Elizabeth)
  HUBEPH: ['940GZZLUEPC'],                      // Elephant & Castle
  HUBFPK: ['940GZZLUFPK'],                      // Finsbury Park
  HUBHMS: ['940GZZLUHSD', '940GZZLUHSC'],       // Hammersmith (District/Piccadilly + H&C/Circle)
  HUBLBG: ['940GZZLULBG'],                      // London Bridge
  HUBRMD: ['940GZZLURMD', '910GRICHMND'],       // Richmond (District + Overground)
  HUBZCW: ['940GZZLUCWR', '910GCNDAW'],         // Canada Water (Jubilee + Overground)
  HUBCAN: ['940GZZLUCGT', '940GZZDLCGT'],       // Canning Town (Jubilee + DLR)
  HUBCUS: ['940GZZDLCUS', '910GCUSTMHS'],       // Custom House (DLR + Elizabeth)
  HUBHHY: ['940GZZLUHAI', '910GHGHI'],          // Highbury & Islington (Victoria + Overground)
  HUBBDS: ['940GZZLUBND', '910GBONDST'],        // Bond Street (Underground + Elizabeth)
  HUBZFD: ['940GZZLUFCN', '910GFRNDXR'],        // Farringdon (Underground + Elizabeth)
  HUBVXH: ['940GZZLUVXL'],                      // Vauxhall (Victoria)
  HUBQPW: ['940GZZLUQRP', '910GQUNPARK'],       // Queen's Park (Bakerloo + Overground)
  HUBWIM: ['940GZZLUWIM', '910GWIMBLDN'],       // Wimbledon (District + Tramlink + National Rail)
  
  // Whitechapel: 940GZZLUWPL serves all lines (District, H&C, Elizabeth, Overground)
  // No split required — single NaPTAN returns complete departures
  HUBZWL: ['940GZZLUWPL'],

  // Manual slug aliases for interchanges / common variants
  'bank':            ['940GZZLUBNK', '940GZZDLBNK'],
  'bank-monument':   ['940GZZLUBNK', '940GZZDLBNK'],
  'monument':        ['940GZZLUMMT'],
  'canary-wharf':    ['940GZZLUCYF', '940GZZDLCAN', '910GCANWHRF'],
  'london-waterloo': ['940GZZLUWLO'],
  'waterloo':        ['940GZZLUWLO'],
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
  'totten-court-rd':  ['940GZZLUTCR', '910GTOTCTRD'],
  'tottenham-court-road': ['940GZZLUTCR', '910GTOTCTRD'],
  'kensington-oly':   ['940GZZLUKOY', '910GKENOLYM'],
  'shepherd-bush':    ['940GZZLUSBC', '910GSHPDSB'],
  'shoreditch-high':  ['910GSHRDHST'],
  'st-james-park':    ['940GZZLUSJP'],
  'st-pauls':         ['940GZZLUSTP'],
  'liverpool-street': ['940GZZLULVT', '910GLIVST'],
  'bond-street':      ['940GZZLUBND', '910GBONDST'],
  'farringdon':       ['940GZZLUFCN', '910GFRNDXR'],
  'kings-cross':      ['940GZZLUKSX'],
  'kings-cross-st-pancras': ['940GZZLUKSX'],
  'queens-park':      ['940GZZLUQRP', '910GQUNPARK'],
  'wimbledon':        ['940GZZLUWIM', '910GWIMBLDN'],
  'city-of-london':   ['910GCTMSLNK'],
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
  // Index entries that have a 940GZZ or 910G NaPTAN id (tube/DLR/Overground/Elizabeth Line/Rail stop points)
  if (entry.id.startsWith('940GZZ') || entry.id.startsWith('910G')) {
    const slug = toSlug(entry.name);
    const existing = SLUG_TO_NAPTAN[slug];
    if (!existing) {
      SLUG_TO_NAPTAN[slug] = entry.id;
    } else {
      // Collision rule: prefer tube (940GZZ) over rail/Overground (910G)
      if (existing.startsWith('910G') && entry.id.startsWith('940GZZ')) {
        SLUG_TO_NAPTAN[slug] = entry.id;
      }
    }
  }
}

// ── 3. Array-based Resolver ───────────────────────────────────────────────────
export function resolveTflStopIds(id: string): string[] {
  // If it's already a Hub or NaPTAN, pass through
  if (id.startsWith('HUB') || id.startsWith('940GZZ') || id.startsWith('910G')) {
    return [id];
  }

  // Normalize lookup key to a slug
  const slug = toSlug(id);

  // Check explicit map (which is keyed by slugs and Hubs)
  if (EXPLICIT_MAP[slug]) {
    return EXPLICIT_MAP[slug];
  }
  if (EXPLICIT_MAP[id]) {
    return EXPLICIT_MAP[id];
  }

  // Try slug-based lookup from full dataset
  if (SLUG_TO_NAPTAN[slug]) {
    return [SLUG_TO_NAPTAN[slug]];
  }

  // Unmapped — warn and return unchanged in array
  console.warn(`[resolveTflStopIds] unmapped station id: "${id}" (slug: "${slug}")`);
  return [id];
}

// ── 4. Store-time Resolver & Backward-Compatible Wrappers ───────────────────────
const SLUG_TO_HUB: Record<string, string> = {
  'bank': 'HUBBAN',
  'bank-monument': 'HUBBAN',
  'canary-wharf': 'HUBCAW',
  'waterloo': 'HUBWAT',
  'london-waterloo': 'HUBWAT',
  'paddington': 'HUBPAD',
  'liverpool-street': 'HUBLST',
  'victoria': 'HUBVIC',
  'euston': 'HUBEUS',
  'stratford': 'HUBSRA',
  'tottenham-court-road': 'HUBTCR',
  'barking': 'HUBBKG',
  'charing-cross': 'HUBCHX',
  'ealing-broadway': 'HUBEAL',
  'elephant-castle': 'HUBEPH',
  'finsbury-park': 'HUBFPK',
  'hammersmith': 'HUBHMS',
  'london-bridge': 'HUBLBG',
  'richmond': 'HUBRMD',
  'wimbledon': 'HUBWIM',
  'canada-water': 'HUBZCW',
  'canning-town': 'HUBCAN',
  'custom-house': 'HUBCUS',
  'highbury-islington': 'HUBHHY',
  'bond-street': 'HUBBDS',
  'farringdon': 'HUBZFD',
  'whitechapel': 'HUBZWL',
  'kings-cross': '940GZZLUKSX',
  'kings-cross-st-pancras': '940GZZLUKSX',
  'vauxhall': 'HUBVXH',
  'queens-park': 'HUBQPW',
};

export function resolveTflStopIdForStore(id: string): string {
  if (id.startsWith('HUB') || id.startsWith('940GZZ') || id.startsWith('910G')) {
    return id;
  }
  const slug = toSlug(id);
  if (SLUG_TO_HUB[slug]) {
    return SLUG_TO_HUB[slug];
  }
  return resolveTflStopId(id);
}

export function resolveTflStopId(id: string): string {
  return resolveTflStopIds(id)[0];
}
