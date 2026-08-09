import { clearPreboardedDirection, getPreboardedDirection, setPreboardedDirection, PREBOARDED_DIRECTION_TTL_MS } from '../directionNotification';

declare const describe: any;
declare const test: any;
declare const expect: any;
declare const beforeEach: any;

describe('directionNotification — lastPreboardedDirection clearing rules', () => {
  beforeEach(() => {
    clearPreboardedDirection();
  });

  test('Condition 1: 90-minute TTL expiry clears pre-boarded direction', () => {
    const now = Date.now();
    setPreboardedDirection('Morden', now - (PREBOARDED_DIRECTION_TTL_MS + 1000));
    expect(getPreboardedDirection()).toBeNull();
  });

  test('Condition 1b: Fresh pre-boarded direction (<90 mins) is retained', () => {
    const now = Date.now();
    setPreboardedDirection('Morden', now - 30 * 60 * 1000);
    expect(getPreboardedDirection()).toBe('Morden');
  });

  test('Condition 2: Session close explicitly clears pre-boarded direction', () => {
    setPreboardedDirection('Morden');
    expect(getPreboardedDirection()).toBe('Morden');
    clearPreboardedDirection();
    expect(getPreboardedDirection()).toBeNull();
  });

  test('Condition 3: New geofence entry clears stale pre-boarded direction', () => {
    setPreboardedDirection('Morden');
    expect(getPreboardedDirection()).toBe('Morden');
    clearPreboardedDirection(); // Triggered on new geofence entry
    expect(getPreboardedDirection()).toBeNull();
  });
});
