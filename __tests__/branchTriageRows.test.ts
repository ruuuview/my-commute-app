// frontend/__tests__/branchTriageRows.test.ts
// Regression test suite for Turn-15 branch failure modes & Option A prerequisites:
// Row 1: isBranchMentioned false-positive exclusions AND true-positive controls
// Row 2: REROUTE_LINE_BRANCHES canonical topology (6 lines: Central, Northern, Piccadilly, District, Met, Elizabeth)
// Row 3: Intent arrival matching disambiguation (first-hit bug reproduction)
// Row 4: Destination branch inference with honest unknown control
// Row 5: Northern line 2-axis reachability constraints (Battersea via Charing Cross only)
// Gate 3: Corridor witness & ambiguous path manual review routing

import { isBranchMentioned } from '../components/rerouteHelpers';
import { REROUTE_LINE_BRANCHES } from '../components/MyCommuteDashboard';

// Mock helpers for functions to be implemented in Phase 2/3
// (Import from source once implemented; local references allow Red-run verification)
import * as RerouteHelpers from '../components/rerouteHelpers';

describe('Branch Triage Regression Suite (Turn 15 Audit & Option A Contracts)', () => {
  // ── ROW 1: isBranchMentioned Precision & True-Positive Controls ───
  describe('Row 1: isBranchMentioned Matcher Precision', () => {
    describe('Negative Controls (Must NOT Match)', () => {
      test('does NOT match Bank branch on "Bank holiday" disruption copy', () => {
        const reason = 'Severe delays across the line due to a Bank holiday engineering over-run.';
        expect(isBranchMentioned('Bank branch', reason)).toBe(false);
        expect(isBranchMentioned('Bank', reason)).toBe(false);
      });

      test('does NOT match Charing Cross branch on "King\'s Cross" station delays', () => {
        const reason = "Minor delays at King's Cross due to an earlier faulty train.";
        expect(isBranchMentioned('Charing Cross branch', reason)).toBe(false);
        expect(isBranchMentioned('Charing Cross', reason)).toBe(false);
      });

      test('does NOT match Charing Cross on generic "cross" token in "cross-platform"', () => {
        const reason = 'Delays due to a cross-platform interchange congestion at Euston.';
        expect(isBranchMentioned('Charing Cross branch', reason)).toBe(false);
      });
    });

    describe('Positive Controls (MUST Match)', () => {
      test('accurately matches Bank branch on genuine station incident at Bank', () => {
        const reason = 'Minor delays due to a signal failure at Bank.';
        expect(isBranchMentioned('Bank branch', reason)).toBe(true);
        expect(isBranchMentioned('Bank', reason)).toBe(true);
      });

      test('accurately matches Charing Cross branch on explicit via clause', () => {
        const reason = 'Part suspended between Camden Town and Kennington via Charing Cross.';
        expect(isBranchMentioned('Charing Cross branch', reason)).toBe(true);
      });

      test('accurately matches Bank branch on explicit "via Bank" clause', () => {
        const reason = 'Severe delays via Bank due to track fault.';
        expect(isBranchMentioned('Bank branch', reason)).toBe(true);
      });
    });
  });

  // ── ROW 2: Canonical Branch Registry Data ────────────────────────
  describe('Row 2: Canonical Line Branch Registry (REROUTE_LINE_BRANCHES)', () => {
    test('Piccadilly line: contains only genuine western branches; excludes northern trunk termini', () => {
      const piccadilly = REROUTE_LINE_BRANCHES['piccadilly'] || [];
      // Must NOT invent branches for northern trunk stations
      expect(piccadilly).not.toContain('Cockfosters branch');
      expect(piccadilly).not.toContain('Arnos Grove branch');
      // Must contain genuine western branches
      expect(piccadilly.some(b => b.toLowerCase().includes('heathrow'))).toBe(true);
      expect(piccadilly.some(b => b.toLowerCase().includes('uxbridge'))).toBe(true);
    });

    test('Metropolitan line: western branches split; excludes eastern terminus', () => {
      const met = REROUTE_LINE_BRANCHES['metropolitan'] || [];
      // Must NOT treat eastern terminus Aldgate as a branch
      expect(met).not.toContain('Aldgate branch');
      // Must separately include Amersham and Chesham (not lumped together)
      expect(met.some(b => b.toLowerCase().includes('amersham') && !b.toLowerCase().includes('chesham'))).toBe(true);
      expect(met.some(b => b.toLowerCase().includes('chesham'))).toBe(true);
      expect(met.some(b => b.toLowerCase().includes('watford'))).toBe(true);
      expect(met.some(b => b.toLowerCase().includes('uxbridge'))).toBe(true);
    });

    test('District line: includes Upminster eastern trunk and all western branches', () => {
      const district = REROUTE_LINE_BRANCHES['district'] || [];
      // Must include Upminster (eastern corridor)
      expect(district.some(b => b.toLowerCase().includes('upminster'))).toBe(true);
      expect(district.some(b => b.toLowerCase().includes('wimbledon'))).toBe(true);
      expect(district.some(b => b.toLowerCase().includes('richmond'))).toBe(true);
      expect(district.some(b => b.toLowerCase().includes('ealing broadway'))).toBe(true);
      expect(district.some(b => b.toLowerCase().includes('edgware road'))).toBe(true);
    });

    test('Northern line: includes Mill Hill East spur and Battersea Power Station branch', () => {
      const northern = REROUTE_LINE_BRANCHES['northern'] || [];
      expect(northern.some(b => b.toLowerCase().includes('mill hill east'))).toBe(true);
      expect(northern.some(b => b.toLowerCase().includes('battersea'))).toBe(true);
      expect(northern.some(b => b.toLowerCase().includes('bank'))).toBe(true);
      expect(northern.some(b => b.toLowerCase().includes('charing cross'))).toBe(true);
      expect(northern.some(b => b.toLowerCase().includes('edgware'))).toBe(true);
      expect(northern.some(b => b.toLowerCase().includes('high barnet'))).toBe(true);
    });

    test('Central line: distinguishes loop branches (Newbury Park vs Woodford)', () => {
      const central = REROUTE_LINE_BRANCHES['central'] || [];
      // Must distinguish Hainault loop branches
      expect(central.some(b => b.toLowerCase().includes('newbury park'))).toBe(true);
      expect(central.some(b => b.toLowerCase().includes('woodford'))).toBe(true);
      expect(central.some(b => b.toLowerCase().includes('west ruislip'))).toBe(true);
      expect(central.some(b => b.toLowerCase().includes('ealing broadway'))).toBe(true);
      expect(central.some(b => b.toLowerCase().includes('epping'))).toBe(true);
    });

    test('Elizabeth line: covers western and eastern branches', () => {
      const liz = REROUTE_LINE_BRANCHES['elizabeth'] || [];
      expect(liz.some(b => b.toLowerCase().includes('reading'))).toBe(true);
      expect(liz.some(b => b.toLowerCase().includes('heathrow'))).toBe(true);
      expect(liz.some(b => b.toLowerCase().includes('shenfield'))).toBe(true);
      expect(liz.some(b => b.toLowerCase().includes('abbey wood'))).toBe(true);
    });
  });

  // ── ROW 3: SwitchEndpointIntent First-Hit Disambiguation ───────────
  describe('Row 3: Intent Arrival Matching Disambiguation', () => {
    interface MockArrival {
      destinationName: string;
      via?: string;
      branch?: string;
      timeToStationSeconds: number;
    }

    test('tapping "Morden (via Bank)" matches Bank train, not earlier Charing Cross train', () => {
      const arrivals: MockArrival[] = [
        { destinationName: 'Morden', via: 'via Charing Cross', timeToStationSeconds: 120 },
        { destinationName: 'Morden', via: 'via Bank', timeToStationSeconds: 240 },
      ];

      const endpointName = 'Morden (via Bank)';

      // Reproduces shipped Swift logic in SwitchEndpointIntent.swift:
      // $0.destinationName.contains(endpointName) || ... || endpointName.contains($0.destinationName)
      const shippedMatch = arrivals.firstMatchShipped(endpointName);

      // The shipped logic wrongly returns arrival 0 because "Morden (via Bank)".includes("Morden") is true!
      // We assert that the matched arrival MUST be the Bank train (index 1)
      expect(shippedMatch).toBe(arrivals[1]);
      expect(shippedMatch?.via).toContain('Bank');
    });
  });

  // ── ROW 4: Destination Branch Inference with Honest Unknown Control 
  describe('Row 4: Destination Branch Inference (inferBranchFromDestination)', () => {
    test('infers Heathrow branch when via is omitted by TfL on Heathrow Terminal 5 arrival', () => {
      const branch = RerouteHelpers.inferBranchFromDestination('piccadilly', 'Heathrow Terminal 5');
      expect(branch).toBe('Heathrow');
    });

    test('honest unknown control: Cockfosters on northern trunk returns undefined (not a fabricated branch)', () => {
      const branch = RerouteHelpers.inferBranchFromDestination('piccadilly', 'Cockfosters');
      expect(branch).toBeUndefined();
    });
  });

  // ── ROW 5: 2-Axis Northern Line Reachability Constraints ──────────
  describe('Row 5: Two-Axis Northern Line Reachability Constraints', () => {
    test('Battersea Power Station runs via Charing Cross ONLY; Battersea via Bank is impossible', () => {
      const canDoBatterseaBank = RerouteHelpers.isReachableCombination('northern', 'Battersea Power Station', 'Bank');
      const canDoBatterseaChX = RerouteHelpers.isReachableCombination('northern', 'Battersea Power Station', 'Charing Cross');

      expect(canDoBatterseaBank).toBe(false);
      expect(canDoBatterseaChX).toBe(true);
    });

    test('Edgware runs via both Bank and Charing Cross corridors', () => {
      const canDoEdgwareBank = RerouteHelpers.isReachableCombination('northern', 'Edgware', 'Bank');
      const canDoEdgwareChX = RerouteHelpers.isReachableCombination('northern', 'Edgware', 'Charing Cross');

      expect(canDoEdgwareBank).toBe(true);
      expect(canDoEdgwareChX).toBe(true);
    });
  });

  // ── GATE 3: Corridor Witness & Ambiguity Invariant ────────────────
  describe('Gate 3: Corridor Witness & Ambiguous Path Routing', () => {
    test('Euston -> Morden with no via and zero corridor platform fixes routes to manual review', () => {
      const result = RerouteHelpers.deriveSessionCorridor({
        lineId: 'northern',
        originStation: 'Euston',
        destinationStation: 'Morden',
        via: undefined,
        intermediateFixes: [],
      });

      expect(result).toEqual({
        corridor: null,
        branchScope: 'unknown',
        requiresManualReview: true,
      });
    });

    test('Euston -> Morden with platform fix at Bank confirms Bank corridor', () => {
      const result = RerouteHelpers.deriveSessionCorridor({
        lineId: 'northern',
        originStation: 'Euston',
        destinationStation: 'Morden',
        via: undefined,
        intermediateFixes: ['HUBBNK'], // Bank station NaPTAN/id
      });

      expect(result).toEqual({
        corridor: 'Bank',
        branchScope: 'partial',
        requiresManualReview: false,
      });
    });
  });
});

// Helper implementing the EXACT current Swift logic from SwitchEndpointIntent.swift:38-43
declare global {
  interface Array<T> {
    firstMatchShipped(endpointName: string): T | undefined;
  }
}

Array.prototype.firstMatchShipped = function (endpointName: string) {
  return RerouteHelpers.matchArrivalEndpoint(this, endpointName);
};
