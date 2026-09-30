import { FULL_STATIONS, searchStations, normalizeStationSearch, sanitiseStationName } from '../data/tflStations';
import Fuse from 'fuse.js';

describe('Station Search Apostrophe & Normalization Invariants', () => {
  const fuse = new Fuse(FULL_STATIONS, {
    keys: ['name', 'searchKeys'],
    threshold: 0.25,
    minMatchCharLength: 3,
    distance: 60,
  });

  describe('Apostrophe & Normalization Independence', () => {
    test('normalizes both straight and curly apostrophes, punctuation and whitespace', () => {
      expect(normalizeStationSearch("King's Cross")).toBe('kings cross');
      expect(normalizeStationSearch('King’s Cross')).toBe('kings cross');
      expect(normalizeStationSearch("St. Paul's")).toBe('st pauls');
      expect(normalizeStationSearch('St.  James’s  Park')).toBe('st jamess park');
      expect(normalizeStationSearch("Earl's Court")).toBe('earls court');
    });

    test('sanitiseStationName removes apostrophes and dots cleanly', () => {
      expect(sanitiseStationName("King's Cross St. Pancras")).toBe('kings cross st pancras');
      expect(sanitiseStationName('King’s Cross St. Pancras')).toBe('kings cross st pancras');
      expect(sanitiseStationName("Earl's Court")).toBe('earls court');
      expect(sanitiseStationName("Queen's Park")).toBe('queens park');
    });
  });

  describe("King's Cross Search Invariants", () => {
    test('typing "kings" returns King\'s Cross as the FIRST result', () => {
      const results = searchStations('kings', FULL_STATIONS, fuse);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toContain("King's Cross");
    });

    test('typing "kings cross" returns King\'s Cross as the FIRST result', () => {
      const results = searchStations('kings cross', FULL_STATIONS, fuse);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toContain("King's Cross");
    });

    test('typing "king\'s cross" returns King\'s Cross as the FIRST result', () => {
      const results = searchStations("king's cross", FULL_STATIONS, fuse);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toContain("King's Cross");
    });

    test('typing "king’s cross" (curly quote) returns King\'s Cross as the FIRST result', () => {
      const results = searchStations('king’s cross', FULL_STATIONS, fuse);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toContain("King's Cross");
    });

    test('typing "st pancras" returns King\'s Cross St. Pancras in top results', () => {
      const results = searchStations('st pancras', FULL_STATIONS, fuse);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toContain("King's Cross");
    });
  });

  describe('Other Stations with Apostrophes', () => {
    test('typing "earls" returns Earl\'s Court as the FIRST result', () => {
      const results = searchStations('earls', FULL_STATIONS, fuse);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toContain("Earl's Court");
    });

    test('typing "earls court" returns Earl\'s Court as the FIRST result', () => {
      const results = searchStations('earls court', FULL_STATIONS, fuse);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toContain("Earl's Court");
    });

    test('typing "queens" returns Queen\'s Park as the FIRST result', () => {
      const results = searchStations('queens', FULL_STATIONS, fuse);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toContain("Queen's Park");
    });

    test('typing "queens park" returns Queen\'s Park as the FIRST result', () => {
      const results = searchStations('queens park', FULL_STATIONS, fuse);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toContain("Queen's Park");
    });

    test('typing "st pauls" returns St. Paul\'s as the FIRST result', () => {
      const results = searchStations('st pauls', FULL_STATIONS, fuse);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toContain("St. Paul's");
    });

    test('typing "shepherds" returns Shepherd\'s Bush as the FIRST result', () => {
      const results = searchStations('shepherds', FULL_STATIONS, fuse);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toContain("Shepherd's Bush");
    });

    test('typing "shepherds bush" returns Shepherd\'s Bush as the FIRST result', () => {
      const results = searchStations('shepherds bush', FULL_STATIONS, fuse);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toContain("Shepherd's Bush");
    });

    test('typing "regents park" returns Regent\'s Park as the FIRST result', () => {
      const results = searchStations('regents park', FULL_STATIONS, fuse);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toContain("Regent's Park");
    });
  });
});
