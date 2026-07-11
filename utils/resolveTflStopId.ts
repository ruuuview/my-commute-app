// utils/resolveTflStopId.ts
//
// Resolves human-readable or Hub station IDs to valid TfL NaPTAN stop-point IDs.
// Supports resolving to an array of NaPTAN IDs for stations with split platforms.

import hubExpansions from '../data/hubExpansions.json';
import fullStationsData from '../data/tflStationsFull.json';

const MANUAL_HUBS: Record<string, string[]> = {
  HUBHHY: ['940GZZLUHAI', '910GHGHI'],
  HUBNXG: ['910GNEWXGTE', '910GNEWXGEL'],
  HUBPAD: ['940GZZLUPAC', '940GZZLUPAH', '910GPADTON', '910GPADTLL'],
  HUBSRA: ['940GZZLUSTD', '940GZZDLSTD', '910GSTFD'],
  HUBTCR: ['940GZZLUTCR', '910GTOTCTRD'],
  HUBVXH: ['940GZZLUVXL', '910GVAUXHLM'],
  HUBZFD: ['940GZZLUFCN', '910GFRNDXR'],
  HUBKGX: ['940GZZLUKSX'],
  HUBSDE: ['940GZZDLSHA', '910GSHADWEL'],
};

const SLUG_TO_HUB: Record<string, string> = {
  'bank': 'HUBBAN',
  'bank-monument': 'HUBBAN',
  'canary-wharf': 'HUBCAW',
  'shadwell': 'HUBSDE',
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
  'king-s-cross': '940GZZLUKSX',
  'king-s-cross-st-pancras': '940GZZLUKSX',
  'vauxhall': 'HUBVXH',
  'queens-park': 'HUBQPW',
  'queen-s-park': 'HUBQPW',
  'st-paul-s': '940GZZLUSPU',
  'st-paul': '940GZZLUSPU',
  'blackhorse-road': 'HUBBHO',
  'west-ham': 'HUBWEH',
  'new-cross': 'HUBNWX',
  'new-cross-gate': 'HUBNXG',
  'willesden-junction': 'HUBWIJ',
  'clapham-junction': 'HUBCLJ',
};

// ── 1. Explicit hand-verified mappings mapping to NaPTAN arrays ──────────────────
const EXPLICIT_MAP: Record<string, string[]> = {
  // Generated expansions from TfL API children
  ...hubExpansions,
  // Manual overrides and 404 fallbacks
  ...MANUAL_HUBS,
 
  // Manual slug aliases for interchanges / common variants
  'bank':            ['940GZZLUBNK', '940GZZDLBNK'],
  'bank-monument':   ['940GZZLUBNK', '940GZZDLBNK'],
  'monument':        ['940GZZLUMMT'],
  'canary-wharf':    ['940GZZLUCYF', '940GZZDLCAN', '910GCANWHRF'],
  'london-waterloo': ['940GZZLUWLO'],
  'waterloo':        ['940GZZLUWLO'],
  'london-bridge':   ['940GZZLULNB'],
  'stratford':       ['940GZZLUSTD', '910GSTFD'],
  'paddington':      ['940GZZLUPAC', '940GZZLUPAH'],
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
  'st-pauls':         ['940GZZLUSPU'],
  'liverpool-street': ['940GZZLULVT', '910GLIVST'],
  'bond-street':      ['940GZZLUBND', '910GBONDST'],
  'farringdon':       ['940GZZLUFCN', '910GFRNDXR'],
  'kings-cross':      ['940GZZLUKSX'],
  'kings-cross-st-pancras': ['940GZZLUKSX'],
  'king-s-cross':      ['940GZZLUKSX'],
  'king-s-cross-st-pancras': ['940GZZLUKSX'],
  'queens-park':      ['940GZZLUQRP', '910GQUNPARK'],
  'queen-s-park':      ['940GZZLUQRP', '910GQUNPARK'],
  'wimbledon':        ['940GZZLUWIM', '910GWIMBLDN'],
  'city-of-london':   ['910GCTMSLNK'],
  'st-james-s-park':  ['940GZZLUSJP'],
  'st-paul-s':        ['940GZZLUSPU'],
  'st-paul':          ['940GZZLUSPU'],
  'shepherd-s-bush':  ['940GZZLUSBC', '910GSHPDSB'],
  'blackhorse-road':  ['940GZZLUBLR', '910GBLCHSRD'],
  'west-ham':         ['940GZZLUWHM'],
  'new-cross':        ['910GNWCRELL'],
  'new-cross-gate':   ['910GNEWXGTE'],
  'willesden-junction': ['910GWLSDJHL'],
  'clapham-junction': ['910GCLPHMJ1'],
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
  // 1. Resolve via SLUG_TO_HUB first to get complete generated hub platform arrays
  const slug = toSlug(id);
  if (SLUG_TO_HUB[slug]) {
    const hubId = SLUG_TO_HUB[slug];
    if (EXPLICIT_MAP[hubId]) {
      return EXPLICIT_MAP[hubId];
    }
  }

  // 2. Known HUBs and slugs in EXPLICIT_MAP get expanded into NaPTAN arrays
  if (EXPLICIT_MAP[id]) {
    return EXPLICIT_MAP[id];
  }

  // 3. Raw NaPTAN pass-through (fast path — no expansion needed)
  if (id.startsWith('940GZZ') || id.startsWith('910G')) {
    return [id];
  }

  // 4. Unknown HUB code — can't expand, warn and let backend try
  if (id.startsWith('HUB')) {
    console.warn(`[resolveTflStopIds] unexpanded HUB id: "${id}" — missing from EXPLICIT_MAP`);
    return [id];
  }

  // 5. Check explicit map by slug
  if (EXPLICIT_MAP[slug]) {
    return EXPLICIT_MAP[slug];
  }

  // 6. Try slug-based lookup from full dataset
  if (SLUG_TO_NAPTAN[slug]) {
    return [SLUG_TO_NAPTAN[slug]];
  }

  // 7. Unmapped — warn and return unchanged in array
  console.warn(`[resolveTflStopIds] unmapped station id: "${id}" (slug: "${slug}")`);
  return [id];
}

// ── 4. Store-time Resolver & Backward-Compatible Wrappers ───────────────────────

export function resolveTflStopIdForStore(id: string): string {
  // Expand HUB codes to their first valid NaPTAN ID so the stored
  // ID is always a backend-queryable stop point, not a hub code
  // that needs re-expansion at every fetch.
  if (id.startsWith('HUB')) {
    const resolved = resolveTflStopIds(id);
    const naptan = resolved.find(r => r.startsWith('940GZZ') || r.startsWith('910G'));
    return naptan || id;
  }
  if (id.startsWith('940GZZ') || id.startsWith('910G')) {
    return id;
  }
  const slug = toSlug(id);
  if (SLUG_TO_HUB[slug]) {
    const hubId = SLUG_TO_HUB[slug];
    const resolved = resolveTflStopIds(hubId);
    const naptan = resolved.find(r => r.startsWith('940GZZ') || r.startsWith('910G'));
    return naptan || hubId;
  }
  return resolveTflStopId(id);
}

export function resolveTflStopId(id: string): string {
  return resolveTflStopIds(id)[0];
}
