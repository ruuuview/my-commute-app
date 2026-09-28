// frontend/targets/MyCommuteWidget/ToggleShushIntent.swift
// LiveActivityIntent for 1-tap manual shush from the Lock Screen / Dynamic Island (iOS 17+).
// Flips today's manual shush state through the SAME shared-state channel the existing intents
// use: App Group UserDefaults (suite "group.com.mycommute.app"). Tapping while unshushed writes
// today's unix timestamp to "manualShushDate"; tapping while shushed today clears it.

import AppIntents
import ActivityKit
import Foundation

/// Reads today's manual shush state from the shared App Group UserDefaults channel.
/// File-scope (no @available gate) so both the intent and the widget view can call it.
public func isManualShushActiveToday() -> Bool {
  guard let userDefaults = UserDefaults(suiteName: "group.com.mycommute.app") else { return false }
  let epoch = userDefaults.double(forKey: "manualShushDate")
  guard epoch > 0 else { return false }
  return Calendar.current.isDate(
    Date(timeIntervalSince1970: epoch),
    equalTo: Date(),
    toGranularity: .day
  )
}

@available(iOS 17.0, *)
public struct ToggleShushIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Toggle Shush Today"
  public static var isDiscoverable: Bool = false

  public init() {
  }

  public func perform() async throws -> some IntentResult {
    // 1. Toggle today's manual shush state in the shared App Group container.
    //    Written first so the shush lands even if no Live Activity is currently running.
    if let userDefaults = UserDefaults(suiteName: "group.com.mycommute.app") {
      if isManualShushActiveToday() {
        userDefaults.removeObject(forKey: "manualShushDate")
      } else {
        userDefaults.set(Date().timeIntervalSince1970, forKey: "manualShushDate")
      }
    }

    // 2. Refresh the Live Activity so the button label flips instantly.
    if let activity = Activity<MyCommuteLiveActivityAttributes>.activities.first {
      await activity.update(ActivityContent(state: activity.content.state, staleDate: Date().addingTimeInterval(300)))
    }

    return .result()
  }
}
