import ActivityKit
import Foundation

public struct Arrival: Codable, Hashable {
  public let destinationName: String
  public let timeToStationSeconds: Int
  public let isHero: Bool

  public init(destinationName: String, timeToStationSeconds: Int, isHero: Bool) {
    self.destinationName = destinationName
    self.timeToStationSeconds = timeToStationSeconds
    self.isHero = isHero
  }
}

public struct MyCommuteLiveActivityAttributes: ActivityAttributes {
  // Static attributes
  public var journeyId: String
  public var originStation: String
  public var destinationStation: String
  public var lineId: String
  public var lineName: String?
  public var stationId: String? // legacy compatibility

  public struct ContentState: Codable, Hashable {
    public var lineName: String
    public var statusSeverity: String      // "good" | "minor_delays" | "severe_delays" | "suspended"
    public var statusText: String          // Max 60 chars (4KB payload limit)
    public var severityTier: Int           // 0-3
    public var nextTrainMinutes: Int
    public var etaTimestamp: Int           // Unix timestamp
    public var etaDelta: String            // "+4m" | "On time" | "N/A"
    public var isEscalated: Bool
    public var detourLine: String?
    public var detourMinutes: Int?
    public var detourStatus: String?       // Actual status of detour line
    public var delayRepayEligible: Bool
    public var estimatedFare: String?      // e.g. "3.60" (displayed with ~ prefix)
    public var delayMinutes: Int
    public var tunnelState: String         // "normal" | "held"
    public var progress: Double            // 0.0-1.0
    public var segmentMaxDuration: Int     // Seconds (for staleDate calculation)
    public var arrivals: [Arrival]?
    public var phase: String               // "approaching" | "in_transit" | "arrived"
    public var selectedEndpoint: String?
    public var availableEndpoints: [String]?
    public var sessionStartTime: Int       // Unix timestamp for native stopwatch
    public var currentStationName: String?
    public var destinationStationName: String?

    public var isDisrupted: Bool {
      return severityTier > 0
    }

    public init(
      lineName: String = "",
      statusSeverity: String = "good",
      statusText: String = "On time",
      severityTier: Int = 0,
      nextTrainMinutes: Int = 0,
      etaTimestamp: Int = 0,
      etaDelta: String = "On time",
      isEscalated: Bool = false,
      detourLine: String? = nil,
      detourMinutes: Int? = nil,
      detourStatus: String? = nil,
      delayRepayEligible: Bool = false,
      estimatedFare: String? = nil,
      delayMinutes: Int = 0,
      tunnelState: String = "normal",
      progress: Double = 0.0,
      segmentMaxDuration: Int = 180,
      arrivals: [Arrival]? = nil,
      phase: String = "approaching",
      selectedEndpoint: String? = nil,
      availableEndpoints: [String]? = nil,
      sessionStartTime: Int = 0,
      currentStationName: String? = nil,
      destinationStationName: String? = nil
    ) {
      self.lineName = lineName
      self.statusSeverity = statusSeverity
      self.statusText = statusText
      self.severityTier = severityTier
      self.nextTrainMinutes = nextTrainMinutes
      self.etaTimestamp = etaTimestamp
      self.etaDelta = etaDelta
      self.isEscalated = isEscalated
      self.detourLine = detourLine
      self.detourMinutes = detourMinutes
      self.detourStatus = detourStatus
      self.delayRepayEligible = delayRepayEligible
      self.estimatedFare = estimatedFare
      self.delayMinutes = delayMinutes
      self.tunnelState = tunnelState
      self.progress = progress
      self.segmentMaxDuration = segmentMaxDuration
      self.arrivals = arrivals
      self.phase = phase
      self.selectedEndpoint = selectedEndpoint
      self.availableEndpoints = availableEndpoints
      self.sessionStartTime = sessionStartTime
      self.currentStationName = currentStationName
      self.destinationStationName = destinationStationName
    }
  }

  public init(
    journeyId: String = "",
    originStation: String = "",
    destinationStation: String = "",
    lineId: String = "",
    lineName: String? = nil,
    stationId: String? = nil
  ) {
    self.journeyId = journeyId
    self.originStation = originStation
    self.destinationStation = destinationStation
    self.lineId = lineId
    self.lineName = lineName
    self.stationId = stationId
  }
}
