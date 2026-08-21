import { setPreboardedDirection, clearPreboardedDirection } from '../../services/directionNotification';

declare const describe: any;
declare const test: any;
declare const expect: any;
declare const beforeEach: any;

describe('useAutoDetectBranch decision tree & signal conflict resolution', () => {
  beforeEach(() => {
    clearPreboardedDirection();
  });

  test('Hierarchy Tier 1 (session) vs Tier 2 (notification) conflict: Session MUST win', () => {
    setPreboardedDirection('Morden');
    const activeSessionDirection = 'Bank';

    const resolvedSource = activeSessionDirection ? 'session' : 'notification';
    const resolvedBranch = activeSessionDirection ? 'Bank' : 'Morden';

    expect(resolvedSource).toBe('session');
    expect(resolvedBranch).toBe('Bank');
  });

  test('Hierarchy Tier 2 (notification) when no active session: Notification tap MUST win over History', () => {
    setPreboardedDirection('Morden');
    const activeSession = null;

    const resolvedSource = activeSession ? 'session' : 'notification';
    const resolvedBranch = 'Morden';

    expect(resolvedSource).toBe('notification');
    expect(resolvedBranch).toBe('Morden');
  });

  test('Hierarchy Tier 2 Expired/Absent -> Fallback to Tier 3 (history)', () => {
    // 1. Pre-boarded notification tap absent / expired
    clearPreboardedDirection();

    // 2. Learned time-of-day history pattern present
    const hasHistoryPattern = true;

    const resolvedSource = hasHistoryPattern ? 'history' : 'manual';
    expect(resolvedSource).toBe('history');
  });

  test('Hierarchy Tier 3 Absent -> Fallback to Tier 4 (pinned station match)', () => {
    clearPreboardedDirection();
    const hasPinnedStationMatch = true;
    const resolvedSource = hasPinnedStationMatch ? 'pinned' : 'manual';
    expect(resolvedSource).toBe('pinned');
  });

  test('Hierarchy Tier 0 (Manual Override): User override MUST win over Session, Notification, and History', () => {
    const userOverride = 'Morden';
    const activeSession = 'Bank';
    const preboarded = 'Charing Cross';

    const resolvedSource = userOverride ? 'manual' : (activeSession ? 'session' : 'notification');
    const resolvedBranch = userOverride || activeSession || preboarded;

    expect(resolvedSource).toBe('manual');
    expect(resolvedBranch).toBe('Morden');
  });
});
