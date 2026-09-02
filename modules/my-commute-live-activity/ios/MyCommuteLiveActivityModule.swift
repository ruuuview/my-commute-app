import ExpoModulesCore
import ActivityKit
import WidgetKit

// MARK: - Bridge module (Expo Modules Core)
//
// This module is the ONLY writer of the Live Activity. It receives a
// cache-shaped payload from RN (already built by the Tier2CacheManager agent)
// and maps it onto ActivityKit. It never fetches, never owns cache state.
//
// It ALSO mirrors the payload to a JSON file in the App Group container so the
// Widget Extension process — which cannot reach the RN bridge — can read the
// same single source of truth for passive Lock Screen / Dynamic Island display.
// Single writer (RN -> this module), single reader (widget). No duplicate cache.

public class MyCommuteLiveActivityModule: Module {
  private let appGroupId = "group.com.mycommute.app"
  private let mirrorFileName = "live-activity-mirror.json"

  public func definition() -> ModuleDefinition {
    Name("MyCommuteLiveActivityModule")

    Events("onActivityUpdate")

    AsyncFunction("startCommuteActivity") { (payload: [String: Any]) -> String? in
      guard #available(iOS 16.2, *) else { return nil }
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }

      // Singleton Teardown: terminate any existing active Live Activities
      let existingActivities = Activity<MyCommuteLiveActivityAttributes>.activities
      for oldActivity in existingActivities {
        Task {
          await oldActivity.end(nil, dismissalPolicy: .immediate)
        }
      }

      let attrs = MyCommuteLiveActivityAttributes(
        stationId: payload["stationId"] as? String ?? "",
        lineId: payload["lineId"] as? String ?? "",
        lineName: payload["lineName"] as? String ?? ""
      )

      let state = Self.state(from: payload)
      self.writeMirror(payload)

      do {
        let staleDate = Date().addingTimeInterval(900) // 15-minute auto-expiry
        let content = ActivityContent(state: state, staleDate: staleDate)
        let activity = try Activity<MyCommuteLiveActivityAttributes>.request(
          attributes: attrs,
          content: content,
          pushType: nil
        )
        return activity.id
      } catch {
        print("[MyCommuteLiveActivity] start failed: \(error.localizedDescription)")
        return nil
      }
    }

    AsyncFunction("updateCommuteActivity") { (payload: [String: Any]) -> Void in
      guard #available(iOS 16.2, *) else { return }
      let state = Self.state(from: payload)
      self.writeMirror(payload)

      let activities = Activity<MyCommuteLiveActivityAttributes>.activities
      guard let activity = activities.first else { return }
      let staleDate = Date().addingTimeInterval(900)
      let content = ActivityContent(state: state, staleDate: staleDate)
      Task {
        await activity.update(content)
      }
    }

    AsyncFunction("endCommuteActivity") { () -> Void in
      guard #available(iOS 16.2, *) else { return }
      let activities = Activity<MyCommuteLiveActivityAttributes>.activities
      let finalState = activities.first?.contentState
      let content = ActivityContent(
        state: finalState ?? Self.emptyState(),
        staleDate: nil
      )
      for activity in activities {
        Task {
          await activity.end(content, dismissalPolicy: .immediate)
        }
      }
      self.clearMirror()
    }

    AsyncFunction("isActivityActive") { () -> Bool in
      guard #available(iOS 16.2, *) else { return false }
      return !Activity<MyCommuteLiveActivityAttributes>.activities.isEmpty
    }

    AsyncFunction("syncWidgetCache") { (linesJson: String, statusesJson: String) -> Void in
      guard let userDefaults = UserDefaults(suiteName: self.appGroupId) else { return }
      if !linesJson.isEmpty {
        userDefaults.set(linesJson, forKey: "myLines")
      }
      if !statusesJson.isEmpty {
        userDefaults.set(statusesJson, forKey: "cachedLineStatuses")
        userDefaults.set(statusesJson, forKey: "cachedTfLStatus")
      }
      userDefaults.synchronize()
      WidgetCenter.shared.reloadAllTimelines()
    }
  }

  // MARK: - Mapping helpers

  private static func state(from payload: [String: Any]) -> MyCommuteLiveActivityAttributes.ContentState {
    let branchKnown = payload["branchKnown"] as? Bool ?? false
    let signal = payload["signalState"] as? String ?? "ok"
    let statusText = payload["statusText"] as? String ?? "On time"
    let isDisrupted = payload["isDisrupted"] as? Bool ?? false

    var arrivals: [Arrival] = []
    if let raw = payload["arrivals"] as? [[String: Any]] {
      for (idx, item) in raw.prefix(3).enumerated() {
        let dest = item["destinationName"] as? String ?? ""
        let tts = item["timeToStationSeconds"] as? Int ?? 0
        arrivals.append(
          Arrival(
            destinationName: dest,
            timeToStationSeconds: tts,
            isHero: idx == 0
          )
        )
      }
    }

    return MyCommuteLiveActivityAttributes.ContentState(
      branchKnown: branchKnown,
      arrivals: arrivals,
      statusText: statusText,
      isDisrupted: isDisrupted,
      signalState: signal
    )
  }

  private static func emptyState() -> MyCommuteLiveActivityAttributes.ContentState {
    MyCommuteLiveActivityAttributes.ContentState(
      branchKnown: false,
      arrivals: [],
      statusText: "On time",
      isDisrupted: false,
      signalState: "ok"
    )
  }

  // MARK: - App Group mirror (for the Widget Extension process)

  private func mirrorURL() -> URL? {
    guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else {
      return nil
    }
    return container.appendingPathComponent(mirrorFileName)
  }

  private func writeMirror(_ payload: [String: Any]) {
    guard let url = mirrorURL() else { return }
    // Only persist what the widget needs — a strict subset of the payload.
    let slim: [String: Any] = [
      "stationId": payload["stationId"] ?? "",
      "lineId": payload["lineId"] ?? "",
      "lineName": payload["lineName"] ?? "",
      "branchKnown": payload["branchKnown"] ?? false,
      "arrivals": payload["arrivals"] ?? [],
      "statusText": payload["statusText"] ?? "On time",
      "isDisrupted": payload["isDisrupted"] ?? false,
      "signalState": payload["signalState"] ?? "ok"
    ]
    try? JSONSerialization.data(withJSONObject: slim).write(to: url)
  }

  private func clearMirror() {
    guard let url = mirrorURL() else { return }
    try? FileManager.default.removeItem(at: url)
  }
}
