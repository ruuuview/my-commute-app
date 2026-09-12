// frontend/targets/MyCommuteWidget/SelectLineIntent.swift
// LiveActivityIntent for silent 1-tap line selection from Lock Screen / Dynamic Island (iOS 17+).

import AppIntents
import ActivityKit
import Foundation

@available(iOS 17.0, *)
public struct SelectLineIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Select Tube Line"
  public static var isDiscoverable: Bool = false

  @Parameter(title: "Line ID") public var lineId: String

  public init() {
    self.lineId = ""
  }

  public init(lineId: String) {
    self.lineId = lineId
  }

  public func perform() async throws -> some IntentResult {
    guard let activity = Activity<MyCommuteLiveActivityAttributes>.activities.first else {
      return .result()
    }

    var updatedState = activity.content.state
    updatedState.phase = "approaching"
    updatedState.lineName = lineId.capitalized

    // Save to App Group UserDefaults
    if let userDefaults = UserDefaults(suiteName: "group.com.mycommute.app") {
      userDefaults.set(lineId, forKey: "selectedCommuteLine")
      userDefaults.set(Date().timeIntervalSince1970, forKey: "selectedCommuteLineTimestamp")
    }

    await activity.update(ActivityContent(state: updatedState, staleDate: Date().addingTimeInterval(300)))

    return .result()
  }
}
