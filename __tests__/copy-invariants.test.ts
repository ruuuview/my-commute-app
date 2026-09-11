import { IN_APP_COPY, formatPotentialRefund } from '../constants/copyBible';

describe('Copy Invariants & Rule 6 Enforcement', () => {
  describe('P0-1: Rule 6 Money Hedge Invariant', () => {
    test('formatPotentialRefund returns hedged output for positive pence values', () => {
      expect(formatPotentialRefund(380)).toBe('potential £3.80');
      expect(formatPotentialRefund(450)).toBe('potential £4.50');
      expect(formatPotentialRefund(undefined)).toBe('potential refund');
      expect(formatPotentialRefund(-100)).toBe('potential refund');
    });

    test('Trigger 3 copy strictly contains required modal hedges', () => {
      const title = IN_APP_COPY.jitTrigger3.title('Jubilee line', 25);
      const body = IN_APP_COPY.jitTrigger3.body('potential £3.80');

      // Assert modal hedge presence
      expect(title.toLowerCase()).toMatch(/potential|may|might|could|qualif/);
      expect(body.toLowerCase()).toMatch(/potential|may|might|could|qualif/);

      // Assert ABSOLUTELY NO unhedged assertions of debt or guaranteed payout
      expect(title.toLowerCase()).not.toMatch(/owes you/);
      expect(title.toLowerCase()).not.toMatch(/guaranteed/);
      expect(body.toLowerCase()).not.toMatch(/your £\d+/);
      expect(body.toLowerCase()).not.toMatch(/guaranteed/);
    });
  });

  describe('P1: UX Confirmshaming & Negative Option Guard', () => {
    test('Secondary CTA buttons do not use guilt-tripping or manipulative wording', () => {
      const ctas = [
        IN_APP_COPY.jitTrigger1.ctaSecondary,
        IN_APP_COPY.jitTrigger2.ctaSecondary,
        IN_APP_COPY.jitTrigger3.ctaSecondary,
      ];

      const bannedGuiltWords = [/suffering/i, /freezing/i, /charity/i, /hate/i, /loser/i];

      for (const cta of ctas) {
        for (const pattern of bannedGuiltWords) {
          expect(cta).not.toMatch(pattern);
        }
      }
    });

    test('Primary and secondary CTAs are concise decisions (<= 4 words)', () => {
      const ctas = [
        IN_APP_COPY.jitTrigger1.ctaPrimary,
        IN_APP_COPY.jitTrigger1.ctaSecondary,
        IN_APP_COPY.jitTrigger2.ctaPrimary,
        IN_APP_COPY.jitTrigger2.ctaSecondary,
        IN_APP_COPY.jitTrigger3.ctaPrimary,
        IN_APP_COPY.jitTrigger3.ctaSecondary,
      ];

      for (const cta of ctas) {
        const wordCount = cta.trim().split(/\s+/).length;
        expect(wordCount).toBeLessThanOrEqual(4);
      }
    });
  });

  describe('P0-3: Glanceability & Character Budget', () => {
    test('Sheet titles are concise and scan-first', () => {
      expect(IN_APP_COPY.jitTrigger1.title.length).toBeLessThanOrEqual(55);
      expect(IN_APP_COPY.jitTrigger2.title.length).toBeLessThanOrEqual(55);
      expect(IN_APP_COPY.jitTrigger3.title('Central line', 20).length).toBeLessThanOrEqual(55);
    });

    test('Zero apology-led language in permission prompts', () => {
      const bodies = [
        IN_APP_COPY.jitTrigger1.body('Stratford'),
        IN_APP_COPY.jitTrigger2.body('Waterloo'),
      ];

      for (const body of bodies) {
        expect(body.toLowerCase()).not.toMatch(/we hate/);
        expect(body.toLowerCase()).not.toMatch(/sorry/);
        expect(body.toLowerCase()).not.toMatch(/apologize/);
      }
    });
  });
});
