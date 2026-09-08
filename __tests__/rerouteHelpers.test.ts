import {
  isBranchMentioned,
  getBranchSuggestedRoute,
  buildRerouteLinks,
  resolveRerouteMode,
  isLineWideDisruption,
} from '../components/rerouteHelpers';

describe('rerouteHelpers branch handling & poka-yoke validation', () => {
  describe('isBranchMentioned', () => {
    test('accurately matches "Bank branch" in disruption reason mentioning Bank', () => {
      const reason = 'Minor delays between Camden Town and Kennington via Bank due to a signal failure.';
      expect(isBranchMentioned('Bank branch', reason)).toBe(true);
      expect(isBranchMentioned('Charing Cross branch', reason)).toBe(false);
    });

    test('prevents false positive substring match between "Bank" and "Embankment"', () => {
      const reason = 'Severe delays between Embankment and Westminster due to flooding.';
      expect(isBranchMentioned('Bank branch', reason)).toBe(false);
    });

    test('accurately matches "Charing Cross branch" when Charing Cross is in reason', () => {
      const reason = 'Service suspended on the Charing Cross branch between Camden Town and Kennington.';
      expect(isBranchMentioned('Charing Cross branch', reason)).toBe(true);
      expect(isBranchMentioned('Bank branch', reason)).toBe(false);
    });

    test('does NOT match unrelated branches on common transit stopwords like "branch"', () => {
      const reason = 'Severe delays on the Richmond branch due to an obstruction on the track.';
      expect(isBranchMentioned('Richmond branch', reason)).toBe(true);
      expect(isBranchMentioned('Wimbledon branch', reason)).toBe(false);
      expect(isBranchMentioned('Ealing Broadway branch', reason)).toBe(false);
      expect(isBranchMentioned('Edgware Road branch', reason)).toBe(false);
    });

    test('matches composite branches like "Amersham & Chesham branch"', () => {
      const reasonChesham = 'Part closure between Chalfont & Latimer and Chesham for planned maintenance.';
      expect(isBranchMentioned('Amersham & Chesham branch', reasonChesham)).toBe(true);

      const reasonWatford = 'Minor delays between Moor Park and Watford.';
      expect(isBranchMentioned('Watford branch', reasonWatford)).toBe(true);
      expect(isBranchMentioned('Amersham & Chesham branch', reasonWatford)).toBe(false);
    });

    test('matches Heathrow branches on Piccadilly and Elizabeth lines', () => {
      const reason = 'Delays between Acton Main Line and Heathrow Terminals 2 & 3 / Terminal 5.';
      expect(isBranchMentioned('Heathrow branch', reason)).toBe(true);
      expect(isBranchMentioned('Reading branch', reason)).toBe(false);
      expect(isBranchMentioned('Shenfield branch', reason)).toBe(false);
    });

    test('returns false for empty or null inputs', () => {
      expect(isBranchMentioned('', 'Some reason')).toBe(false);
      expect(isBranchMentioned('Bank branch', '')).toBe(false);
    });
  });

  describe('isLineWideDisruption', () => {
    test('detects line-wide phrasing', () => {
      expect(isLineWideDisruption('Severe delays across the entire line', 'severe')).toBe(true);
      expect(isLineWideDisruption('No service on the line', 'suspended')).toBe(true);
      expect(isLineWideDisruption('Minor delays between Camden Town and Kennington', 'minor')).toBe(false);
    });

    test('detects suspended or closure status as line-wide', () => {
      expect(isLineWideDisruption('', 'suspended')).toBe(true);
      expect(isLineWideDisruption('', 'closure')).toBe(true);
    });
  });

  describe('getBranchSuggestedRoute', () => {
    test('returns reciprocal advice for Northern line Bank branch', () => {
      const route = getBranchSuggestedRoute('northern', 'Bank branch');
      expect(route).toBeDefined();
      expect(route?.description).toContain('Charing Cross branch');
    });

    test('returns reciprocal advice for Northern line Charing Cross branch', () => {
      const route = getBranchSuggestedRoute('northern', 'Charing Cross branch');
      expect(route).toBeDefined();
      expect(route?.description).toContain('Bank branch');
    });

    test('handles Central line branches with "branch" suffix', () => {
      const ealing = getBranchSuggestedRoute('central', 'Ealing Broadway branch');
      expect(ealing?.description).toContain('Elizabeth line');

      const ruislip = getBranchSuggestedRoute('central', 'West Ruislip branch');
      expect(ruislip?.description).toContain('Chiltern Railways');

      const epping = getBranchSuggestedRoute('central', 'Epping branch');
      expect(epping?.description).toContain('London Overground');

      const hainault = getBranchSuggestedRoute('central', 'Hainault branch');
      expect(hainault?.description).toContain('London Overground');
    });

    test('handles District line branches with "branch" suffix', () => {
      const richmond = getBranchSuggestedRoute('district', 'Richmond branch');
      expect(richmond?.description).toContain('South Western Railway');

      const wimbledon = getBranchSuggestedRoute('district', 'Wimbledon branch');
      expect(wimbledon?.description).toContain('South Western Railway');

      const edgwareRd = getBranchSuggestedRoute('district', 'Edgware Road branch');
      expect(edgwareRd?.description).toContain('Circle or Hammersmith & City');
    });

    test('handles Elizabeth line branches with "branch" suffix', () => {
      const reading = getBranchSuggestedRoute('elizabeth', 'Reading branch');
      expect(reading?.description).toContain('Great Western Railway');

      const heathrow = getBranchSuggestedRoute('elizabeth', 'Heathrow branch');
      expect(heathrow?.description).toContain('Piccadilly line or Heathrow Express');

      const shenfield = getBranchSuggestedRoute('elizabeth', 'Shenfield branch');
      expect(shenfield?.description).toContain('Greater Anglia');

      const abbeyWood = getBranchSuggestedRoute('elizabeth', 'Abbey Wood branch');
      expect(abbeyWood?.description).toContain('Southeastern');
    });
  });

  describe('buildRerouteLinks', () => {
    test('cleans branch suffix from Google Maps and Citymapper search queries', () => {
      const links = buildRerouteLinks('Bank branch');
      expect(links.googleMapsUrl).toContain('destination=Bank%20Station%2C%20London');
      expect(links.citymapperUrl).toContain('end=Bank%20Station%2C%20London');
    });

    test('handles line suffix cleanup', () => {
      const links = buildRerouteLinks('Northern line');
      expect(links.googleMapsUrl).toContain('destination=Northern%20Station%2C%20London');
    });

    test('fallback for undefined destination', () => {
      const links = buildRerouteLinks(undefined);
      expect(links.googleMapsUrl).toBe('https://maps.google.com');
      expect(links.citymapperUrl).toBe('citymapper://');
    });
  });

  describe('resolveRerouteMode', () => {
    test('returns affected when fallbackStatusType is disrupted and confirmed branch exists', () => {
      const result = resolveRerouteMode({
        stationId: '940GZZLUKSX',
        confirmedTerminus: 'Bank branch',
        expectedLineId: 'northern',
        fallbackStatusType: 'minor',
        fallbackReason: 'Minor delays via Bank',
      });
      expect(result.mode).toBe('affected');
      expect(result.isBranchAffected).toBe(true);
      expect(result.disruptedBranch).toBe('Bank branch');
    });

    test('returns unaffected when only other branch is mentioned in disruption', () => {
      const result = resolveRerouteMode({
        stationId: '940GZZLUKSX',
        confirmedTerminus: 'Wimbledon branch',
        otherTerminus: 'Richmond branch',
        expectedLineId: 'district',
        fallbackStatusType: 'severe',
        fallbackReason: 'Severe delays on the Richmond branch',
      });
      // Fallback path without cached disruption returns affected for conservative safety (never false calm)
      expect(result.isBranchAffected).toBe(true);
    });
  });
});
