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
  // Static for the life of the activity.
  public var stationId: String
  public var lineId: String
  public var lineName: String

  // Mutable content state.
  public struct ContentState: Codable, Hashable {
    public var branchKnown: Bool
    public var arrivals: [Arrival]
    public var statusText: String
    public var isDisrupted: Bool
    // "ok" | "no-signal" | "meltdown"
    public var signalState: String

    public init(
      branchKnown: Bool,
      arrivals: [Arrival],
      statusText: String,
      isDisrupted: Bool,
      signalState: String
    ) {
      self.branchKnown = branchKnown
      self.arrivals = arrivals
      self.statusText = statusText
      self.isDisrupted = isDisrupted
      self.signalState = signalState
    }
  }

  public init(stationId: String, lineId: String, lineName: String) {
    self.stationId = stationId
    self.lineId = lineId
    self.lineName = lineName
  }
}
