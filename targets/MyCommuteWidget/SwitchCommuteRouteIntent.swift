// frontend/targets/MyCommuteWidget/SwitchCommuteRouteIntent.swift
// LiveActivityIntent for silent 1-tap route switching from the Dynamic Island / Lock Screen.
// Mutates ContentState in the widget process without waking the main app or breaking Shush.

import AppIntents
import ActivityKit
import Foundation

@available(iOS 17.0, *)
public struct SwitchCommuteRouteIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Switch to Detour Route"
  public static var isDiscoverable: Bool = false

  @Parameter(title: "New Line") public var newLineId: String
  @Parameter(title: "Transfer Station") public var transferStation: String
  @Parameter(title: "Detour Current Status") public var detourCurrentStatus: String
  @Parameter(title: "Detour ETA Delta") public var detourEtaDelta: String

  public init() {
    self.newLineId = ""
    self.transferStation = ""
    self.detourCurrentStatus = "good"
    self.detourEtaDelta = "+5m"
  }

  public init(newLineId: String, transferStation: String, detourCurrentStatus: String, detourEtaDelta: String) {
    self.newLineId = newLineId
    self.transferStation = transferStation
    self.detourCurrentStatus = detourCurrentStatus
    self.detourEtaDelta = detourEtaDelta
  }

  public func perform() async throws -> some IntentResult {
    guard let activity = Activity<MyCommuteLiveActivityAttributes>.activities.first else {
      return .result()
    }

    // 1. Optimistic local mutation (instant)
    let newState = MyCommuteLiveActivityAttributes.ContentState(
      lineName: newLineId.capitalized,
      statusSeverity: detourCurrentStatus,  // ACTUAL status, not "good"
      statusText: "Detour via \(transferStation)",
      severityTier: 0,
      nextTrainMinutes: 1,
      etaTimestamp: Int(Date().addingTimeInterval(480).timeIntervalSince1970),
      etaDelta: detourEtaDelta,
      isEscalated: false,
      detourLine: nil,
      detourMinutes: nil,
      detourStatus: nil,
      delayRepayEligible: false,
      estimatedFare: nil,
      delayMinutes: 0,
      tunnelState: "normal",
      progress: 0.1,
      segmentMaxDuration: activity.content.state.segmentMaxDuration
    )
    await activity.update(ActivityContent(state: newState, staleDate: Date().addingTimeInterval(900)))

    // 2. Persist to App Group container so RN and backend sync seamlessly
    if let userDefaults = UserDefaults(suiteName: "group.com.mycommute.app") {
      userDefaults.set(newLineId, forKey: "detourActiveLine")
      userDefaults.set(Date().timeIntervalSince1970, forKey: "detourSwitchedAt")
      userDefaults.synchronize()
    }

    // 3. AWAIT network (keeps extension process alive, no unattached tasks)
    let backendEndpoint = UserDefaults(suiteName: "group.com.mycommute.app")?.string(forKey: "backendApiUrl") ?? "https://api.mycommute.app"
    if let url = URL(string: "\(backendEndpoint)/api/sessions/detour") {
      var request = URLRequest(url: url)
      request.httpMethod = "POST"
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      let payload: [String: Any] = [
        "journeyId": activity.attributes.journeyId,
        "newLineId": newLineId,
        "transferStation": transferStation
      ]
      if let body = try? JSONSerialization.data(withJSONObject: payload) {
        request.httpBody = body
        do {
          _ = try await URLSession.shared.data(for: request)
        } catch {
          // Network failed (e.g. commuter underground in tunnel).
          // Optimistic UI is preserved: commuter is physically on the detour train.
        }
      }
    }

    return .result()
  }
}
