// frontend/services/ArrivalDetector.ts
// Pure, deterministic arrival state machine.
// Implements Reversible-Candidate Arrival:
// 1. Dwell >= 90s -> candidate_arrival
// 2. Train acceleration (> 15 km/h) -> candidate discarded
// 3. Dark tunnel gap -> stale candidate implicitly superseded at next station
// 4. Sustained displacement away from platform centroid at walking speed (<= 7.2 km/h) -> confirmed_arrival

export interface GeoCoordinate {
  latitude: number
  longitude: number
}

export interface LocationFix {
  latitude: number
  longitude: number
  accuracyMeters: number
  speedKmh: number // km/h
  timestampMs: number
}

export interface StationLocation {
  id: string
  name: string
  latitude: number
  longitude: number
}

// Calibration constants (empirical values subject to real-world tuning)
export const CALIBRATION_CONSTANTS = {
  STATION_RADIUS_METERS: 150,
  DWELL_CANDIDATE_SEC: 90,
  TRAIN_DEPARTURE_KMH: 15.0,
  BRISK_WALK_MAX_KMH: 7.2,
  CONFIRMATION_MIN_DISPLACEMENT_METERS: 120, // Distance from center indicating movement towards exit
  EXIT_DISPLACEMENT_THRESHOLD_METERS: 150,   // Past station perimeter
}

/** Haversine formula to compute distance in meters between two lat/lon coordinates. */
export function calculateDistanceMeters(coord1: GeoCoordinate, coord2: GeoCoordinate): number {
  const R = 6371000 // Earth radius in meters
  const dLat = ((coord2.latitude - coord1.latitude) * Math.PI) / 180
  const dLon = ((coord2.longitude - coord1.longitude) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coord1.latitude * Math.PI) / 180) *
      Math.cos((coord2.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export type DetectorState = 'in_transit' | 'candidate_arrival' | 'confirmed_arrival'

export interface CandidateInfo {
  stationId: string
  stationName: string
  firstSeenMs: number
  candidateMarkedMs: number
  initialDistanceMeters: number
}

export interface ArrivalDetectorResult {
  state: DetectorState
  candidate: CandidateInfo | null
  confirmedStation: StationLocation | null
  arrivalTimestampMs: number | null
  currentStation?: StationLocation | null
  reason: string
}

export class ArrivalDetector {
  private state: DetectorState = 'in_transit'
  private candidate: CandidateInfo | null = null
  private confirmedStation: StationLocation | null = null
  private arrivalTimestampMs: number | null = null
  private lineStations: StationLocation[]
  private originStationId: string

  constructor(lineStations: StationLocation[], originStationId: string) {
    this.lineStations = lineStations
    this.originStationId = originStationId
  }

  public getState(): DetectorState {
    return this.state
  }

  public getCandidate(): CandidateInfo | null {
    return this.candidate
  }

  public getConfirmedStation(): StationLocation | null {
    return this.confirmedStation
  }

  public getArrivalTimestamp(): number | null {
    return this.arrivalTimestampMs
  }

  /**
   * Process a new incoming location fix from CoreLocation.
   */
  public processFix(fix: LocationFix): ArrivalDetectorResult {
    // Find nearest station on the corridor
    let nearestStation: StationLocation | null = null
    let minDistance = Infinity

    for (const station of this.lineStations) {
      const dist = calculateDistanceMeters(fix, {
        latitude: station.latitude,
        longitude: station.longitude,
      })
      if (dist < minDistance) {
        minDistance = dist
        nearestStation = station
      }
    }

    const isNearStation = minDistance <= CALIBRATION_CONSTANTS.STATION_RADIUS_METERS
    const isOrigin = nearestStation?.id === this.originStationId
    const currentStation = isNearStation ? nearestStation : (this.state === 'confirmed_arrival' ? this.confirmedStation : null)

    if (this.state === 'confirmed_arrival') {
      return {
        state: this.state,
        candidate: null,
        confirmedStation: this.confirmedStation,
        arrivalTimestampMs: this.arrivalTimestampMs,
        currentStation: this.confirmedStation,
        reason: 'Already confirmed arrival',
      }
    }

    // 1. If currently in CANDIDATE state:
    if (this.state === 'candidate_arrival' && this.candidate && nearestStation) {
      // Check for Tunnel Decay / Station Jump (the fix is at a completely different station downstream)
      if (nearestStation.id !== this.candidate.stationId && minDistance <= CALIBRATION_CONSTANTS.STATION_RADIUS_METERS) {
        // Train moved through dark tunnel and surfaced at next station!
        // Implicitly supersede/discard the previous candidate
        this.candidate = null
        this.state = 'in_transit'
        return {
          state: 'in_transit',
          candidate: null,
          confirmedStation: null,
          arrivalTimestampMs: null,
          currentStation,
          reason: `Stale candidate at different station superseded by fix at ${nearestStation.name}`,
        }
      }

      // Check for Train Acceleration Discard (> 15 km/h)
      if (fix.speedKmh >= CALIBRATION_CONSTANTS.TRAIN_DEPARTURE_KMH) {
        const discardedStation = this.candidate.stationName
        this.candidate = null
        this.state = 'in_transit'
        return {
          state: 'in_transit',
          candidate: null,
          confirmedStation: null,
          arrivalTimestampMs: null,
          currentStation,
          reason: `Train accelerated to ${fix.speedKmh.toFixed(1)} km/h away from ${discardedStation}. Candidate discarded.`,
        }
      }

      // Check for Exit Confirmation: Sustained DISPLACEMENT away from platform center at pedestrian speed
      const distanceFromCenter = calculateDistanceMeters(fix, {
        latitude: nearestStation.latitude,
        longitude: nearestStation.longitude,
      })

      const isWalkingSpeed =
        fix.speedKmh >= 0 && fix.speedKmh <= CALIBRATION_CONSTANTS.BRISK_WALK_MAX_KMH;
      const hasDisplacedTowardExit =
        distanceFromCenter >= CALIBRATION_CONSTANTS.CONFIRMATION_MIN_DISPLACEMENT_METERS &&
        distanceFromCenter > this.candidate.initialDistanceMeters + 30

      if (isWalkingSpeed && hasDisplacedTowardExit) {
        this.state = 'confirmed_arrival'
        this.confirmedStation = nearestStation
        this.arrivalTimestampMs = this.candidate.candidateMarkedMs
        const resultCandidate = this.candidate
        this.candidate = null
        return {
          state: 'confirmed_arrival',
          candidate: resultCandidate,
          confirmedStation: this.confirmedStation,
          arrivalTimestampMs: this.arrivalTimestampMs,
          currentStation: this.confirmedStation,
          reason: `Confirmed arrival at ${nearestStation.name} via sustained exit displacement (${distanceFromCenter.toFixed(0)}m at ${fix.speedKmh.toFixed(1)} km/h)`,
        }
      }

      // Still lingering / dwell in progress
      return {
        state: 'candidate_arrival',
        candidate: this.candidate,
        confirmedStation: null,
        arrivalTimestampMs: null,
        currentStation,
        reason: `Candidate arrival at ${this.candidate.stationName} pending exit displacement`,
      }
    }

    // 2. If in IN_TRANSIT state:
    if (this.state === 'in_transit') {
      // If we are at the origin station, we ignore arrival checks (trip just started or in progress)
      if (isOrigin) {
        return {
          state: 'in_transit',
          candidate: null,
          confirmedStation: null,
          arrivalTimestampMs: null,
          currentStation,
          reason: 'At origin station, ignoring arrival triggers',
        }
      }

      if (isNearStation && nearestStation) {
        // If speed is train-like, this is just a passing train or above-ground track segment
        if (fix.speedKmh >= CALIBRATION_CONSTANTS.TRAIN_DEPARTURE_KMH) {
          return {
            state: 'in_transit',
            candidate: null,
            confirmedStation: null,
            arrivalTimestampMs: null,
            currentStation,
            reason: `Express pass-through at ${nearestStation.name} (${fix.speedKmh.toFixed(1)} km/h)`,
          }
        }

        // Potential dwell: if we haven't seen this station yet, start tracking dwell
        if (!this.candidate) {
          this.candidate = {
            stationId: nearestStation.id,
            stationName: nearestStation.name,
            firstSeenMs: fix.timestampMs,
            candidateMarkedMs: fix.timestampMs,
            initialDistanceMeters: minDistance,
          }
        }

        const dwellDurationSec = (fix.timestampMs - this.candidate.firstSeenMs) / 1000

        if (dwellDurationSec >= CALIBRATION_CONSTANTS.DWELL_CANDIDATE_SEC) {
          // Reached 90s dwell -> elevate to candidate_arrival
          this.state = 'candidate_arrival'
          this.candidate.candidateMarkedMs = fix.timestampMs
          return {
            state: 'candidate_arrival',
            candidate: this.candidate,
            confirmedStation: null,
            arrivalTimestampMs: null,
            currentStation,
            reason: `Dwell at ${nearestStation.name} reached ${dwellDurationSec.toFixed(0)}s (>= ${CALIBRATION_CONSTANTS.DWELL_CANDIDATE_SEC}s). Candidate marked.`,
          }
        } else {
          // Ordinary 20-40s intermediate station dwell
          return {
            state: 'in_transit',
            candidate: this.candidate,
            confirmedStation: null,
            arrivalTimestampMs: null,
            currentStation,
            reason: `Dwell at ${nearestStation.name} (${dwellDurationSec.toFixed(0)}s < ${CALIBRATION_CONSTANTS.DWELL_CANDIDATE_SEC}s). Normal intermediate stop.`,
          }
        }
      } else {
        // Not near any station (tunnel or open track)
        this.candidate = null
      }
    }

    return {
      state: 'in_transit',
      candidate: null,
      confirmedStation: null,
      arrivalTimestampMs: null,
      currentStation: null,
      reason: 'In transit',
    }
  }
}
