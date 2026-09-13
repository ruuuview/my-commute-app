import ActivityKit
import Foundation

public struct Arrival: Codable, Hashable {
  public let destinationName: String
  public let timeToStationSeconds: Int
  public let isHero: Bool
  public let via: String?
  public let branch: String?

  public init(
    destinationName: String,
    timeToStationSeconds: Int,
    isHero: Bool,
    via: String? = nil,
    branch: String? = nil
  ) {
    self.destinationName = destinationName
    self.timeToStationSeconds = timeToStationSeconds
    self.isHero = isHero
    self.via = via
    self.branch = branch
  }
}

public struct ApproachingEndpoint: Codable, Hashable {
  public let destinationName: String
  public let branchText: String?
  public let minutesToArrival: Int
  public let previousStationName: String?
  public let stopsAway: Int
  public let etaTimestamp: Int

  public init(
    destinationName: String,
    branchText: String? = nil,
    minutesToArrival: Int = 0,
    previousStationName: String? = nil,
    stopsAway: Int = 1,
    etaTimestamp: Int = 0
  ) {
    self.destinationName = destinationName
    self.branchText = branchText
    self.minutesToArrival = minutesToArrival
    self.previousStationName = previousStationName
    self.stopsAway = stopsAway
    self.etaTimestamp = etaTimestamp
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
    public var phase: String               // "line_picker" | "approaching" | "in_transit" | "arrived"
    public var selectedEndpoint: String?
    public var availableEndpoints: [String]?
    public var branchName: String?
    public var sessionStartTime: Int       // Unix timestamp for native stopwatch
    public var currentStationName: String?
    public var destinationStationName: String?
    
    // Delivery Architecture extensions (State 0, State 1, State 2)
    public var availableLines: [String]?
    public var availableLineNames: [String]?
    public var approachingEndpoints: [ApproachingEndpoint]?
    public var nextStationName: String?
    public var nextStationEtaMinutes: Int?
    public var nextStationEtaTimestamp: Int?
    public var isStaleEta: Bool?

    public var isDisrupted: Bool {
      return severityTier > 0
    }

    public var isOfflineMode: Bool {
      return (isStaleEta == true) || tunnelState == "held" || tunnelState == "offline"
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
      branchName: String? = nil,
      sessionStartTime: Int = 0,
      currentStationName: String? = nil,
      destinationStationName: String? = nil,
      availableLines: [String]? = nil,
      availableLineNames: [String]? = nil,
      approachingEndpoints: [ApproachingEndpoint]? = nil,
      nextStationName: String? = nil,
      nextStationEtaMinutes: Int? = nil,
      nextStationEtaTimestamp: Int? = nil,
      isStaleEta: Bool? = nil
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
      self.branchName = branchName
      self.sessionStartTime = sessionStartTime
      self.currentStationName = currentStationName
      self.destinationStationName = destinationStationName
      self.availableLines = availableLines
      self.availableLineNames = availableLineNames
      self.approachingEndpoints = approachingEndpoints
      self.nextStationName = nextStationName
      self.nextStationEtaMinutes = nextStationEtaMinutes
      self.nextStationEtaTimestamp = nextStationEtaTimestamp
      self.isStaleEta = isStaleEta
    }
    
    // N-1 Backwards-compatible custom decoder
    public init(from decoder: Decoder) throws {
      let container = try decoder.container(keyedBy: CodingKeys.self)
      lineName = try container.decodeIfPresent(String.self, forKey: .lineName) ?? ""
      statusSeverity = try container.decodeIfPresent(String.self, forKey: .statusSeverity) ?? "good"
      statusText = try container.decodeIfPresent(String.self, forKey: .statusText) ?? "On time"
      severityTier = try container.decodeIfPresent(Int.self, forKey: .severityTier) ?? 0
      nextTrainMinutes = try container.decodeIfPresent(Int.self, forKey: .nextTrainMinutes) ?? 0
      etaTimestamp = try container.decodeIfPresent(Int.self, forKey: .etaTimestamp) ?? 0
      etaDelta = try container.decodeIfPresent(String.self, forKey: .etaDelta) ?? "On time"
      isEscalated = try container.decodeIfPresent(Bool.self, forKey: .isEscalated) ?? false
      detourLine = try container.decodeIfPresent(String.self, forKey: .detourLine)
      detourMinutes = try container.decodeIfPresent(Int.self, forKey: .detourMinutes)
      detourStatus = try container.decodeIfPresent(String.self, forKey: .detourStatus)
      delayRepayEligible = try container.decodeIfPresent(Bool.self, forKey: .delayRepayEligible) ?? false
      estimatedFare = try container.decodeIfPresent(String.self, forKey: .estimatedFare)
      delayMinutes = try container.decodeIfPresent(Int.self, forKey: .delayMinutes) ?? 0
      tunnelState = try container.decodeIfPresent(String.self, forKey: .tunnelState) ?? "normal"
      progress = try container.decodeIfPresent(Double.self, forKey: .progress) ?? 0.0
      segmentMaxDuration = try container.decodeIfPresent(Int.self, forKey: .segmentMaxDuration) ?? 180
      arrivals = try container.decodeIfPresent([Arrival].self, forKey: .arrivals)
      phase = try container.decodeIfPresent(String.self, forKey: .phase) ?? "approaching"
      selectedEndpoint = try container.decodeIfPresent(String.self, forKey: .selectedEndpoint)
      availableEndpoints = try container.decodeIfPresent([String].self, forKey: .availableEndpoints)
      branchName = try container.decodeIfPresent(String.self, forKey: .branchName)
      sessionStartTime = try container.decodeIfPresent(Int.self, forKey: .sessionStartTime) ?? 0
      currentStationName = try container.decodeIfPresent(String.self, forKey: .currentStationName)
      destinationStationName = try container.decodeIfPresent(String.self, forKey: .destinationStationName)
      availableLines = try container.decodeIfPresent([String].self, forKey: .availableLines)
      availableLineNames = try container.decodeIfPresent([String].self, forKey: .availableLineNames)
      approachingEndpoints = try container.decodeIfPresent([ApproachingEndpoint].self, forKey: .approachingEndpoints)
      nextStationName = try container.decodeIfPresent(String.self, forKey: .nextStationName)
      nextStationEtaMinutes = try container.decodeIfPresent(Int.self, forKey: .nextStationEtaMinutes)
      nextStationEtaTimestamp = try container.decodeIfPresent(Int.self, forKey: .nextStationEtaTimestamp)
      isStaleEta = try container.decodeIfPresent(Bool.self, forKey: .isStaleEta)
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
