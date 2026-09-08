// frontend/__tests__/ArrivalDetector.test.ts
// Unit tests verifying the Reversible-Candidate Arrival Detector contracts:
// 1. 30s dwell -> ignored (intermediate stop)
// 2. 90s dwell -> candidate arrival
// 3. Departure fix > 15 km/h -> candidate discarded (train acceleration)
// 4. Tunnel decay: candidate at intermediate station, no fixes in tunnel, fix at next station -> candidate superseded, session alive
// 5. Exit-walk confirmation: displacement away from centroid at brisk 7.0 km/h confirms arrival
// 6. Stopped train with zero displacement does NOT falsely confirm exit

import { ArrivalDetector, StationLocation, LocationFix } from '../services/ArrivalDetector'

const MOCK_STATIONS: StationLocation[] = [
  { id: 'HUBKX', name: "King's Cross", latitude: 51.5308, longitude: -0.1238 },
  { id: 'HUBEUS', name: 'Euston', latitude: 51.5282, longitude: -0.1337 },
  { id: 'HUBWAR', name: 'Warren Street', latitude: 51.5247, longitude: -0.1384 },
  { id: 'HUBOXC', name: 'Oxford Circus', latitude: 51.5152, longitude: -0.1419 },
]

describe('ArrivalDetector (Reversible-Candidate State Machine)', () => {
  let detector: ArrivalDetector

  beforeEach(() => {
    // Commute from King's Cross towards Oxford Circus
    detector = new ArrivalDetector(MOCK_STATIONS, 'HUBKX')
  })

  test('30s dwell at intermediate station (Euston) is treated as normal intermediate stop', () => {
    const t0 = 1000000

    // Arrives at Euston platform
    const fix1: LocationFix = {
      latitude: 51.5282,
      longitude: -0.1337,
      accuracyMeters: 20,
      speedKmh: 0,
      timestampMs: t0,
    }
    const r1 = detector.processFix(fix1)
    expect(r1.state).toBe('in_transit')

    // 30 seconds later, train doors close
    const fix2: LocationFix = {
      latitude: 51.5282,
      longitude: -0.1337,
      accuracyMeters: 20,
      speedKmh: 0,
      timestampMs: t0 + 30000,
    }
    const r2 = detector.processFix(fix2)
    expect(r2.state).toBe('in_transit')
    expect(detector.getState()).toBe('in_transit')
  })

  test('90s dwell at intermediate station (Warren Street) elevates to candidate_arrival', () => {
    const t0 = 1000000

    // Train stopped at Warren Street
    detector.processFix({
      latitude: 51.5247,
      longitude: -0.1384,
      accuracyMeters: 20,
      speedKmh: 0,
      timestampMs: t0,
    })

    // 95 seconds later, train is still held at Warren Street
    const result = detector.processFix({
      latitude: 51.5247,
      longitude: -0.1384,
      accuracyMeters: 20,
      speedKmh: 0,
      timestampMs: t0 + 95000,
    })

    expect(result.state).toBe('candidate_arrival')
    expect(result.candidate?.stationId).toBe('HUBWAR')
    expect(result.candidate?.stationName).toBe('Warren Street')
  })

  test('departure fix > 15 km/h discards candidate when train resumes moving', () => {
    const t0 = 1000000

    // 1. Establish candidate at Warren Street (held for 90s)
    detector.processFix({
      latitude: 51.5247,
      longitude: -0.1384,
      accuracyMeters: 20,
      speedKmh: 0,
      timestampMs: t0,
    })
    detector.processFix({
      latitude: 51.5247,
      longitude: -0.1384,
      accuracyMeters: 20,
      speedKmh: 0,
      timestampMs: t0 + 95000,
    })
    expect(detector.getState()).toBe('candidate_arrival')

    // 2. Train accelerates out of Warren Street down the track at 35 km/h
    const result = detector.processFix({
      latitude: 51.5235,
      longitude: -0.1390,
      accuracyMeters: 30,
      speedKmh: 35.0, // > 15 km/h
      timestampMs: t0 + 110000,
    })

    expect(result.state).toBe('in_transit')
    expect(result.candidate).toBeNull()
    expect(detector.getState()).toBe('in_transit')
  })

  test('tunnel decay: candidate at Warren Street, zero tunnel fixes, next fix at Oxford Circus supersedes candidate', () => {
    const t0 = 1000000

    // 1. Establish candidate at Warren Street
    detector.processFix({
      latitude: 51.5247,
      longitude: -0.1384,
      accuracyMeters: 20,
      speedKmh: 0,
      timestampMs: t0,
    })
    detector.processFix({
      latitude: 51.5247,
      longitude: -0.1384,
      accuracyMeters: 20,
      speedKmh: 0,
      timestampMs: t0 + 95000,
    })
    expect(detector.getState()).toBe('candidate_arrival')

    // 2. Dark tunnel: ZERO fixes for 3 minutes as train travels underground
    // 3. Surfacing / fix at Oxford Circus platform
    const oxfordCircusFix: LocationFix = {
      latitude: 51.5152,
      longitude: -0.1419,
      accuracyMeters: 25,
      speedKmh: 0,
      timestampMs: t0 + 270000, // 4.5 minutes later
    }

    const result = detector.processFix(oxfordCircusFix)

    // Old candidate at Warren Street was discarded; session is still alive in transit!
    expect(result.state).toBe('in_transit')
    expect(detector.getState()).toBe('in_transit')
    expect(result.reason).toContain('superseded')
  })

  test('exit-walk confirmation: sustained displacement away from platform centroid at brisk 7.0 km/h confirms arrival', () => {
    const t0 = 1000000

    // 1. Establish candidate at Oxford Circus (destination)
    detector.processFix({
      latitude: 51.5152,
      longitude: -0.1419,
      accuracyMeters: 15,
      speedKmh: 0,
      timestampMs: t0,
    })
    detector.processFix({
      latitude: 51.5152,
      longitude: -0.1419,
      accuracyMeters: 15,
      speedKmh: 0,
      timestampMs: t0 + 95000,
    })
    expect(detector.getState()).toBe('candidate_arrival')

    // 2. Commuter walks briskly up the escalators towards the street exit
    // Moving ~135 meters away towards Regent Street at 7.0 km/h
    const exitFix: LocationFix = {
      latitude: 51.5164, // ~135m North from platform center
      longitude: -0.1419,
      accuracyMeters: 10,
      speedKmh: 7.0, // Brisk walk (<= 7.2 km/h)
      timestampMs: t0 + 130000,
    }

    const result = detector.processFix(exitFix)

    expect(result.state).toBe('confirmed_arrival')
    expect(result.confirmedStation?.id).toBe('HUBOXC')
    expect(result.arrivalTimestampMs).toBe(t0 + 95000) // Re-anchored to arrival time
  })

  test('stopped train with zero displacement does NOT falsely confirm exit', () => {
    const t0 = 1000000

    // 1. Candidate established at platform
    detector.processFix({
      latitude: 51.5152,
      longitude: -0.1419,
      accuracyMeters: 15,
      speedKmh: 0,
      timestampMs: t0,
    })
    detector.processFix({
      latitude: 51.5152,
      longitude: -0.1419,
      accuracyMeters: 15,
      speedKmh: 0,
      timestampMs: t0 + 95000,
    })
    expect(detector.getState()).toBe('candidate_arrival')

    // 2. Train is still motionless on the platform (speed 0, same coordinates)
    const heldTrainFix: LocationFix = {
      latitude: 51.5152,
      longitude: -0.1419,
      accuracyMeters: 15,
      speedKmh: 0,
      timestampMs: t0 + 120000,
    }

    const result = detector.processFix(heldTrainFix)

    // Must NOT confirm arrival! Still candidate.
    expect(result.state).toBe('candidate_arrival')
    expect(detector.getState()).toBe('candidate_arrival')
  })

  test('escalator egress: slow walking speed on escalator (3.2 km/h) reaching exit displacement confirms arrival', () => {
    const t0 = 1000000

    // Establish candidate at Oxford Circus
    detector.processFix({
      latitude: 51.5152,
      longitude: -0.1419,
      accuracyMeters: 10,
      speedKmh: 0,
      timestampMs: t0,
    })
    detector.processFix({
      latitude: 51.5152,
      longitude: -0.1419,
      accuracyMeters: 10,
      speedKmh: 0,
      timestampMs: t0 + 95000,
    })
    expect(detector.getState()).toBe('candidate_arrival')

    // Escalator ascent / egress towards street: moving 125m away at 3.2 km/h
    const escalatorFix: LocationFix = {
      latitude: 51.51633, // ~126m displacement
      longitude: -0.1419,
      accuracyMeters: 10,
      speedKmh: 3.2,
      timestampMs: t0 + 140000,
    }

    const result = detector.processFix(escalatorFix)
    expect(result.state).toBe('confirmed_arrival')
    expect(result.confirmedStation?.id).toBe('HUBOXC')
    expect(result.reason).toContain('sustained exit displacement')
  })

  test('pedestrian pass-through at origin: lingers or passes through origin without falsely creating candidate or confirming arrival', () => {
    const t0 = 1000000

    // Commuter enters King's Cross (origin) ticket hall and waits 100 seconds on concourse
    const r1 = detector.processFix({
      latitude: 51.5308,
      longitude: -0.1238,
      accuracyMeters: 15,
      speedKmh: 2.0,
      timestampMs: t0,
    })
    expect(r1.state).toBe('in_transit')
    expect(r1.candidate).toBeNull()

    const r2 = detector.processFix({
      latitude: 51.5308,
      longitude: -0.1238,
      accuracyMeters: 15,
      speedKmh: 0,
      timestampMs: t0 + 100000,
    })
    expect(r2.state).toBe('in_transit')
    expect(r2.candidate).toBeNull()
    expect(detector.getState()).toBe('in_transit')
  })
})

