// frontend/targets/MyCommuteWidget/SwitchEndpointIntent.swift
// LiveActivityIntent for silent 1-tap train endpoint filtering from Lock Screen / Dynamic Island (iOS 17+).
// Updates the Live Activity ContentState in-place and persists choice to App Group container.

import AppIntents
import ActivityKit
import Foundation

@available(iOS 17.0, *)
public struct SwitchEndpointIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Filter Train by Destination"
  public static var isDiscoverable: Bool = false

  @Parameter(title: "Endpoint Name") public var endpointName: String
  @Parameter(title: "Line ID") public var lineId: String

  public init() {
    self.endpointName = ""
    self.lineId = ""
  }

  public init(endpointName: String, lineId: String) {
    self.endpointName = endpointName
    self.lineId = lineId
  }

  public func perform() async throws -> some IntentResult {
    guard let activity = Activity<MyCommuteLiveActivityAttributes>.activities.first else {
      return .result()
    }

    // 1. Optimistically update the Live Activity content state with selected endpoint
    var updatedState = activity.content.state
    updatedState.selectedEndpoint = endpointName

    // If arrivals are present, find the soonest train matching this endpoint or branch
    // Disambiguate when endpointName specifies a via/corridor (e.g. "Morden (via Bank)")
    let cleanEndpoint = endpointName.trimmingCharacters(in: .whitespaces)
    let viaPattern = try? NSRegularExpression(pattern: "\\((?:via\\s+)?([^)]+)\\)", options: .caseInsensitive)
    var targetVia: String? = nil
    var targetDest = cleanEndpoint

    if let match = viaPattern?.firstMatch(in: cleanEndpoint, range: NSRange(cleanEndpoint.startIndex..., in: cleanEndpoint)),
       let viaRange = Range(match.range(at: 1), in: cleanEndpoint) {
      targetVia = String(cleanEndpoint[viaRange]).trimmingCharacters(in: .whitespaces)
      if let fullRange = Range(match.range(at: 0), in: cleanEndpoint) {
        targetDest = cleanEndpoint.replacingCharacters(in: fullRange, with: "").trimmingCharacters(in: .whitespaces)
      }
    }

    if let arrivals = updatedState.arrivals,
       let matchingArrival = arrivals.first(where: { arrival in
         let destMatches = arrival.destinationName.localizedCaseInsensitiveContains(targetDest) ||
                           targetDest.localizedCaseInsensitiveContains(arrival.destinationName)
         if let targetVia = targetVia {
           let viaMatches = (arrival.via?.localizedCaseInsensitiveContains(targetVia) == true) ||
                            (arrival.branch?.localizedCaseInsensitiveContains(targetVia) == true)
           return destMatches && viaMatches
         }
         return destMatches ||
                (arrival.via?.localizedCaseInsensitiveContains(endpointName) == true) ||
                (arrival.branch?.localizedCaseInsensitiveContains(endpointName) == true)
       }) {
      updatedState.nextTrainMinutes = max(0, Int((matchingArrival.timeToStationSeconds + 30) / 60))
      if let via = matchingArrival.via {
        updatedState.branchName = via.replacingOccurrences(of: "via ", with: "", options: .caseInsensitive).trimmingCharacters(in: .whitespaces)
      } else if let branch = matchingArrival.branch {
        updatedState.branchName = branch
      }
    }

    await activity.update(ActivityContent(state: updatedState, staleDate: Date().addingTimeInterval(300)))

    // 2. Persist selection to App Group storage
    if let userDefaults = UserDefaults(suiteName: "group.com.mycommute.app") {
      userDefaults.set(endpointName, forKey: "selectedTrainEndpoint")
      userDefaults.set(Date().timeIntervalSince1970, forKey: "selectedTrainEndpointTimestamp")
    }

    return .result()
  }
}
