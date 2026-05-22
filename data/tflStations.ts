// data/tflStations.ts
// Bundled TfL station dataset — no API call required for search.
// Source: TfL open data. Used by Fuse.js in onboarding/stations.tsx.

export interface TfLStation {
  id: string;
  name: string;
  lines: string[];
  zone?: number;
}

import fullStationsData from './tflStationsFull.json';

export const FULL_STATIONS: TfLStation[] = fullStationsData as TfLStation[];

export const TFL_STATIONS: TfLStation[] = [
  // Zone 1
  { id: 'aldgate',          name: 'Aldgate',               lines: ['circle','metropolitan'],                  zone: 1 },
  { id: 'aldgate-east',     name: 'Aldgate East',          lines: ['district','hammersmith-city'],            zone: 1 },
  { id: 'angel',            name: 'Angel',                 lines: ['northern'],                               zone: 1 },
  { id: 'baker-street',     name: 'Baker Street',          lines: ['bakerloo','circle','hammersmith-city','jubilee','metropolitan'], zone: 1 },
  { id: 'bank',             name: 'Bank',                  lines: ['central','northern','dlr','waterloo-city'],zone: 1 },
  { id: 'barbican',         name: 'Barbican',              lines: ['circle','hammersmith-city','metropolitan'],zone: 1 },
  { id: 'bethnal-green',    name: 'Bethnal Green',         lines: ['central'],                                zone: 2 },
  { id: 'blackfriars',      name: 'Blackfriars',           lines: ['circle','district'],                      zone: 1 },
  { id: 'bond-street',      name: 'Bond Street',           lines: ['central','elizabeth','jubilee'],          zone: 1 },
  { id: 'borough',          name: 'Borough',               lines: ['northern'],                               zone: 1 },
  { id: 'cannon-street',    name: 'Cannon Street',         lines: ['circle','district'],                      zone: 1 },
  { id: 'canary-wharf',     name: 'Canary Wharf',          lines: ['jubilee','dlr','elizabeth'],              zone: 2 },
  { id: 'charing-cross',    name: 'Charing Cross',         lines: ['bakerloo','northern'],                    zone: 1 },
  { id: 'city-of-london',   name: 'City Thameslink',       lines: ['elizabeth'],                              zone: 1 },
  { id: 'elephant-castle',  name: 'Elephant & Castle',     lines: ['bakerloo','northern'],                    zone: 1 },
  { id: 'embankment',       name: 'Embankment',            lines: ['bakerloo','circle','district','northern'],zone: 1 },
  { id: 'euston',           name: 'Euston',                lines: ['northern','victoria'],                    zone: 1 },
  { id: 'euston-square',    name: 'Euston Square',         lines: ['circle','hammersmith-city','metropolitan'],zone: 1 },
  { id: 'farringdon',       name: 'Farringdon',            lines: ['circle','elizabeth','hammersmith-city','metropolitan'], zone: 1 },
  { id: 'fenchurch-street', name: 'Fenchurch Street',      lines: ['elizabeth'],                              zone: 1 },
  { id: 'green-park',       name: 'Green Park',            lines: ['jubilee','piccadilly','victoria'],        zone: 1 },
  { id: 'holborn',          name: 'Holborn',               lines: ['central','piccadilly'],                   zone: 1 },
  { id: 'hyde-park-corner', name: 'Hyde Park Corner',      lines: ['piccadilly'],                             zone: 1 },
  { id: 'kennington',       name: 'Kennington',            lines: ['northern'],                               zone: 2 },
  { id: 'kings-cross',      name: "King's Cross St. Pancras", lines: ['circle','hammersmith-city','metropolitan','northern','piccadilly','victoria'], zone: 1 },
  { id: 'knightsbridge',    name: 'Knightsbridge',         lines: ['piccadilly'],                             zone: 1 },
  { id: 'lambeth-north',    name: 'Lambeth North',         lines: ['bakerloo'],                               zone: 1 },
  { id: 'lancaster-gate',   name: 'Lancaster Gate',        lines: ['central'],                                zone: 1 },
  { id: 'liverpool-street', name: 'Liverpool Street',      lines: ['central','circle','elizabeth','hammersmith-city','metropolitan'], zone: 1 },
  { id: 'london-bridge',    name: 'London Bridge',         lines: ['jubilee','northern'],                     zone: 1 },
  { id: 'london-waterloo',  name: 'Waterloo',              lines: ['bakerloo','jubilee','northern','waterloo-city'], zone: 1 },
  { id: 'mansion-house',    name: 'Mansion House',         lines: ['circle','district'],                      zone: 1 },
  { id: 'marble-arch',      name: 'Marble Arch',           lines: ['central'],                                zone: 1 },
  { id: 'mile-end',         name: 'Mile End',              lines: ['central','district','hammersmith-city'],  zone: 2 },
  { id: 'monument',         name: 'Monument',              lines: ['circle','district'],                      zone: 1 },
  { id: 'moorgate',         name: 'Moorgate',              lines: ['circle','elizabeth','hammersmith-city','metropolitan','northern'], zone: 1 },
  { id: 'old-street',       name: 'Old Street',            lines: ['northern'],                               zone: 1 },
  { id: 'oxford-circus',    name: 'Oxford Circus',         lines: ['bakerloo','central','victoria'],          zone: 1 },
  { id: 'paddington',       name: 'Paddington',            lines: ['bakerloo','circle','district','elizabeth','hammersmith-city'], zone: 1 },
  { id: 'pimlico',          name: 'Pimlico',               lines: ['victoria'],                               zone: 1 },
  { id: 'russell-square',   name: 'Russell Square',        lines: ['piccadilly'],                             zone: 1 },
  { id: 'sloane-square',    name: 'Sloane Square',         lines: ['circle','district'],                      zone: 1 },
  { id: 'southwark',        name: 'Southwark',             lines: ['jubilee'],                                zone: 1 },
  { id: 'st-james-park',    name: "St. James's Park",      lines: ['circle','district'],                      zone: 1 },
  { id: 'st-pauls',         name: "St. Paul's",            lines: ['central'],                                zone: 1 },
  { id: 'stockwell',        name: 'Stockwell',             lines: ['northern','victoria'],                    zone: 2 },
  { id: 'temple',           name: 'Temple',                lines: ['circle','district'],                      zone: 1 },
  { id: 'totten-court-rd',  name: 'Tottenham Court Road',  lines: ['central','elizabeth','northern'],         zone: 1 },
  { id: 'tower-hill',       name: 'Tower Hill',            lines: ['circle','district'],                      zone: 1 },
  { id: 'vauxhall',         name: 'Vauxhall',              lines: ['victoria'],                               zone: 1 },
  { id: 'victoria',         name: 'Victoria',              lines: ['circle','district','victoria'],           zone: 1 },
  { id: 'warren-street',    name: 'Warren Street',         lines: ['northern','victoria'],                    zone: 1 },
  { id: 'westminster',      name: 'Westminster',           lines: ['circle','district','jubilee'],            zone: 1 },
  // Zone 2
  { id: 'balham',           name: 'Balham',                lines: ['northern'],                               zone: 3 },
  { id: 'brixton',          name: 'Brixton',               lines: ['victoria'],                               zone: 2 },
  { id: 'camden-town',      name: 'Camden Town',           lines: ['northern'],                               zone: 2 },
  { id: 'canada-water',     name: 'Canada Water',          lines: ['jubilee','overground'],                   zone: 2 },
  { id: 'canning-town',     name: 'Canning Town',          lines: ['jubilee','dlr'],                         zone: 3 },
  { id: 'clapham-common',   name: 'Clapham Common',        lines: ['northern'],                               zone: 2 },
  { id: 'clapham-junction', name: 'Clapham Junction',      lines: ['overground'],                             zone: 2 },
  { id: 'clapham-north',    name: 'Clapham North',         lines: ['northern'],                               zone: 2 },
  { id: 'clapham-south',    name: 'Clapham South',         lines: ['northern'],                               zone: 2 },
  { id: 'custom-house',     name: 'Custom House',          lines: ['dlr','elizabeth'],                        zone: 3 },
  { id: 'dalston-junction', name: 'Dalston Junction',      lines: ['overground'],                             zone: 2 },
  { id: 'east-putney',      name: 'East Putney',           lines: ['district'],                               zone: 3 },
  { id: 'finsbury-park',    name: 'Finsbury Park',         lines: ['piccadilly','victoria'],                  zone: 2 },
  { id: 'hammersmith',      name: 'Hammersmith',           lines: ['district','hammersmith-city','piccadilly'],zone: 2 },
  { id: 'highbury-islington',name:'Highbury & Islington',  lines: ['victoria','overground'],                  zone: 2 },
  { id: 'highgate',         name: 'Highgate',              lines: ['northern'],                               zone: 3 },
  { id: 'homerton',         name: 'Homerton',              lines: ['overground'],                             zone: 2 },
  { id: 'kensington-oly',   name: 'Kensington Olympia',   lines: ['district','overground'],                  zone: 2 },
  { id: 'lewisham',         name: 'Lewisham',              lines: ['dlr','elizabeth'],                        zone: 3 },
  { id: 'notting-hill-gate',name: 'Notting Hill Gate',     lines: ['central','circle','district'],            zone: 2 },
  { id: 'oval',             name: 'Oval',                  lines: ['northern'],                               zone: 2 },
  { id: 'putney-bridge',    name: 'Putney Bridge',         lines: ['district'],                               zone: 2 },
  { id: 'queens-park',      name: "Queen's Park",          lines: ['bakerloo'],                               zone: 2 },
  { id: 'shadwell',         name: 'Shadwell',              lines: ['dlr','overground'],                       zone: 2 },
  { id: 'shepherd-bush',    name: "Shepherd's Bush",       lines: ['central','overground'],                   zone: 2 },
  { id: 'shoreditch-high',  name: 'Shoreditch High Street',lines: ['overground'],                             zone: 1 },
  { id: 'south-kensington', name: 'South Kensington',      lines: ['circle','district','piccadilly'],         zone: 1 },
  { id: 'stratford',        name: 'Stratford',             lines: ['central','dlr','elizabeth','jubilee','overground'], zone: 3 },
  { id: 'tooting-bec',      name: 'Tooting Bec',           lines: ['northern'],                               zone: 3 },
  { id: 'tooting-broadway', name: 'Tooting Broadway',      lines: ['northern'],                               zone: 3 },
  { id: 'wapping',          name: 'Wapping',               lines: ['overground'],                             zone: 2 },
  { id: 'whitechapel',      name: 'Whitechapel',           lines: ['district','elizabeth','hammersmith-city','overground'], zone: 2 },
  // Zone 3+
  { id: 'barking',          name: 'Barking',               lines: ['district','hammersmith-city','overground'],zone: 4 },
  { id: 'ealing-broadway',  name: 'Ealing Broadway',       lines: ['central','district','elizabeth'],         zone: 3 },
  { id: 'east-ham',         name: 'East Ham',              lines: ['district','hammersmith-city'],            zone: 4 },
  { id: 'heathrow-t123',    name: 'Heathrow Terminals 2&3',lines: ['elizabeth','piccadilly'],                  zone: 6 },
  { id: 'heathrow-t4',      name: 'Heathrow Terminal 4',   lines: ['piccadilly'],                             zone: 6 },
  { id: 'heathrow-t5',      name: 'Heathrow Terminal 5',   lines: ['elizabeth','piccadilly'],                  zone: 6 },
  { id: 'ilford',           name: 'Ilford',                lines: ['elizabeth'],                              zone: 4 },
  { id: 'richmond',         name: 'Richmond',              lines: ['district','overground'],                  zone: 4 },
  { id: 'romford',          name: 'Romford',               lines: ['elizabeth'],                              zone: 6 },
  { id: 'wimbledon',        name: 'Wimbledon',             lines: ['district'],                               zone: 3 },
];

// Popular stations shown when search is empty (zone 1 key hubs)
export const POPULAR_STATIONS = TFL_STATIONS.filter(s =>
  ['london-waterloo','liverpool-street','london-bridge','victoria','kings-cross',
   'oxford-circus','canary-wharf','paddington','euston','bank','stratford'].includes(s.id)
);
