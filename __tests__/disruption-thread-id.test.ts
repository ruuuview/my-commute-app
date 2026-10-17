import { disruptionThreadId } from '../services/notifications/payload';
import tflRouteData from '../data/tflRouteData.json';

describe('disruptionThreadId (TDD Invariant Contract)', () => {
  it('formats canonical line-disruption identifier correctly', () => {
    expect(disruptionThreadId('victoria')).toBe('line-disruption-victoria');
  });

  it('normalizes uppercase and surrounding whitespace', () => {
    expect(disruptionThreadId(' Victoria ')).toBe('line-disruption-victoria');
    expect(disruptionThreadId('HAMMERSMITH-CITY')).toBe('line-disruption-hammersmith-city');
  });

  it('generates distinct thread IDs for distinct lines', () => {
    expect(disruptionThreadId('victoria')).not.toBe(disruptionThreadId('central'));
    expect(disruptionThreadId('jubilee')).not.toBe(disruptionThreadId('northern'));
  });

  it('is completely isolated from commute session journey collapse IDs', () => {
    const threadId = disruptionThreadId('victoria');
    const journeyCollapseId = 'commute_user_123_journey_456';
    expect(threadId).not.toBe(journeyCollapseId);
    expect(threadId.startsWith('line-disruption-')).toBe(true);
    expect(journeyCollapseId.startsWith('commute_')).toBe(true);
  });

  it('covers all 19 canonical TfL routes without collision', () => {
    const threadIds = new Set<string>();
    const lines = Object.keys(tflRouteData.routes);

    expect(lines.length).toBe(19);

    for (const lineId of lines) {
      const threadId = disruptionThreadId(lineId);
      expect(threadId).toBe(`line-disruption-${lineId.toLowerCase()}`);
      expect(threadIds.has(threadId)).toBe(false);
      threadIds.add(threadId);
    }

    expect(threadIds.size).toBe(19);
  });
});
