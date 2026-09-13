import ExpoModulesCore
import ActivityKit
import WidgetKit
import UserNotifications
import UIKit

// MARK: - Bridge module (Expo Modules Core)
//
// This module is the single writer of the Live Activity on iOS.
// Supports:
// - ActivityKit Live Activity lifecycle (start, update, end)
// - Singleton enforcement (cancelling any prior activity before starting a new one)
// - Dual-token push registration (Push-to-Start on iOS 17.2+, Live Activity pushTokenUpdates)
// - App Group cache mirroring for the Widget Extension process
// - Time-Sensitive notification permission queries

public class MyCommuteLiveActivityModule: Module {
  private let appGroupId = "group.com.mycommute.app"
  private let mirrorFileName = "live-activity-mirror.json"
  private var pushToStartTask: Task<Void, Never>?

  public func definition() -> ModuleDefinition {
    Name("MyCommuteLiveActivityModule")

    Events("onActivityUpdate", "onPushToStartTokenUpdate", "onLiveActivityPushTokenUpdate")

    OnCreate {
      self.startPushToStartObservation()
    }

    OnDestroy {
      self.pushToStartTask?.cancel()
      self.pushToStartTask = nil
    }

    AsyncFunction("startCommuteActivity") { (payload: [String: Any]) -> String? in
      guard #available(iOS 16.2, *) else { return nil }
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }

      // 1. Singleton Enforce: Atomic teardown of all pre-existing Live Activities
      let existingActivities = Activity<MyCommuteLiveActivityAttributes>.activities
      for oldActivity in existingActivities {
        Task {
          await oldActivity.end(nil, dismissalPolicy: .immediate)
        }
      }

      let journeyId = payload["journeyId"] as? String ?? "j_\(Int(Date().timeIntervalSince1970))"
      let originStation = payload["originStation"] as? String ?? (payload["stationId"] as? String ?? "")
      let destinationStation = payload["destinationStation"] as? String ?? ""
      let lineId = payload["lineId"] as? String ?? ""
      let lineName = payload["lineName"] as? String ?? ""

      let attrs = MyCommuteLiveActivityAttributes(
        journeyId: journeyId,
        originStation: originStation,
        destinationStation: destinationStation,
        lineId: lineId,
        lineName: lineName,
        stationId: originStation
      )

      let state = Self.state(from: payload)
      self.writeMirror(payload)

      do {
        let staleTimeout = TimeInterval(state.segmentMaxDuration > 0 ? state.segmentMaxDuration : 900)
        let staleDate: Date? = state.isOfflineMode
          ? nil
          : (state.etaTimestamp > 0
              ? Date(timeIntervalSince1970: TimeInterval(state.etaTimestamp)).addingTimeInterval(staleTimeout)
              : Date().addingTimeInterval(900))

        let content = ActivityContent(state: state, staleDate: staleDate)

        // Request with pushType: .token to obtain remote APNs updates
        let activity = try Activity<MyCommuteLiveActivityAttributes>.request(
          attributes: attrs,
          content: content,
          pushType: .token
        )

        // 2. Observe Live Activity Push Token updates (handles token rotation)
        Task {
          for await tokenData in activity.pushTokenUpdates {
            let tokenStr = tokenData.map { String(format: "%02x", $0) }.joined()
            self.sendEvent("onLiveActivityPushTokenUpdate", [
              "journeyId": journeyId,
              "token": tokenStr
            ])
          }
        }

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

      let staleTimeout = TimeInterval(state.segmentMaxDuration > 0 ? state.segmentMaxDuration : 900)
      let staleDate: Date? = state.isOfflineMode
        ? nil
        : (state.etaTimestamp > 0
            ? Date(timeIntervalSince1970: TimeInterval(state.etaTimestamp)).addingTimeInterval(staleTimeout)
            : Date().addingTimeInterval(900))

      let content = ActivityContent(state: state, staleDate: staleDate)
      Task {
        await activity.update(content)
      }
    }

    AsyncFunction("endCommuteActivity") { () -> Void in
      guard #available(iOS 16.2, *) else { return }
      let activities = Activity<MyCommuteLiveActivityAttributes>.activities
      let finalState = activities.first?.content.state
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

    AsyncFunction("hasDynamicIsland") { () -> Bool in
      // Dynamic Island is present on iPhone 14 Pro, 14 Pro Max, and all iPhone 15 & 16 series
      if #available(iOS 16.0, *) {
        let isPhone = UIDevice.current.userInterfaceIdiom == .phone
        let screenHeight = UIScreen.main.nativeBounds.height
        // 2556 = 14 Pro, 15, 15 Pro, 16
        // 2796 = 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
        // 2622 / 2868 = 16 Pro / 16 Pro Max
        let isDIHeight = screenHeight == 2556 || screenHeight == 2796 || screenHeight == 2622 || screenHeight == 2868
        return isPhone && isDIHeight
      }
      return false
    }

    AsyncFunction("checkTimeSensitivePermission") { () -> Bool in
      let center = UNUserNotificationCenter.current()
      let settings = await center.notificationSettings()
      if #available(iOS 15.0, *) {
        return settings.timeSensitiveSetting == .enabled
      }
      return settings.authorizationStatus == .authorized
    }

    AsyncFunction("requestTimeSensitivePermission") { () -> Bool in
      let center = UNUserNotificationCenter.current()
      do {
        var options: UNAuthorizationOptions = [.alert, .sound, .badge]
        if #available(iOS 15.0, *) {
          options.insert(.timeSensitive)
        }
        let granted = try await center.requestAuthorization(options: options)
        return granted
      } catch {
        return false
      }
    }
  }

  // MARK: - Push-to-Start Token Observation (iOS 17.2+)

  private func startPushToStartObservation() {
    guard #available(iOS 17.2, *) else { return }
    pushToStartTask?.cancel()
    pushToStartTask = Task { [weak self] in
      for await tokenData in Activity<MyCommuteLiveActivityAttributes>.pushToStartTokenUpdates {
        guard let self = self else { return }
        let tokenStr = tokenData.map { String(format: "%02x", $0) }.joined()
        self.sendEvent("onPushToStartTokenUpdate", ["token": tokenStr])
      }
    }
  }

  // MARK: - Mapping helpers

  private static func state(from payload: [String: Any]) -> MyCommuteLiveActivityAttributes.ContentState {
    let lineName = payload["lineName"] as? String ?? ""
    let statusSeverity = payload["statusSeverity"] as? String ?? "good"
    let statusText = payload["statusText"] as? String ?? "On time"
    let severityTier = payload["severityTier"] as? Int ?? 0
    let nextTrainMinutes = payload["nextTrainMinutes"] as? Int ?? 0
    let etaTimestamp = payload["etaTimestamp"] as? Int ?? Int(Date().addingTimeInterval(480).timeIntervalSince1970)
    let etaDelta = payload["etaDelta"] as? String ?? "On time"
    let isEscalated = payload["isEscalated"] as? Bool ?? (severityTier >= 3)
    let detourLine = payload["detourLine"] as? String
    let detourMinutes = payload["detourMinutes"] as? Int
    let detourStatus = payload["detourStatus"] as? String
    let delayRepayEligible = payload["delayRepayEligible"] as? Bool ?? false
    let estimatedFare = payload["estimatedFare"] as? String
    let delayMinutes = payload["delayMinutes"] as? Int ?? 0
    let tunnelState = payload["tunnelState"] as? String ?? "normal"
    let progress = payload["progress"] as? Double ?? 0.0
    let segmentMaxDuration = payload["segmentMaxDuration"] as? Int ?? 180
    let phase = payload["phase"] as? String ?? "approaching"
    let selectedEndpoint = payload["selectedEndpoint"] as? String
    let availableEndpoints = payload["availableEndpoints"] as? [String]
    let branchName = payload["branchName"] as? String
    let sessionStartTime = payload["sessionStartTime"] as? Int ?? 0
    let currentStationName = payload["currentStationName"] as? String
    let destinationStationName = payload["destinationStationName"] as? String

    var arrivals: [Arrival] = []
    if let raw = payload["arrivals"] as? [[String: Any]] {
      for (idx, item) in raw.prefix(3).enumerated() {
        let dest = item["destinationName"] as? String ?? ""
        let tts = item["timeToStationSeconds"] as? Int ?? 0
        let via = item["via"] as? String
        let branch = item["branch"] as? String
        arrivals.append(
          Arrival(
            destinationName: dest,
            timeToStationSeconds: tts,
            isHero: idx == 0,
            via: via,
            branch: branch
          )
        )
      }
    }

    return MyCommuteLiveActivityAttributes.ContentState(
      lineName: lineName,
      statusSeverity: statusSeverity,
      statusText: statusText,
      severityTier: severityTier,
      nextTrainMinutes: nextTrainMinutes,
      etaTimestamp: etaTimestamp,
      etaDelta: etaDelta,
      isEscalated: isEscalated,
      detourLine: detourLine,
      detourMinutes: detourMinutes,
      detourStatus: detourStatus,
      delayRepayEligible: delayRepayEligible,
      estimatedFare: estimatedFare,
      delayMinutes: delayMinutes,
      tunnelState: tunnelState,
      progress: progress,
      segmentMaxDuration: segmentMaxDuration,
      arrivals: arrivals.isEmpty ? nil : arrivals,
      phase: phase,
      selectedEndpoint: selectedEndpoint,
      availableEndpoints: availableEndpoints,
      branchName: branchName,
      sessionStartTime: sessionStartTime,
      currentStationName: currentStationName,
      destinationStationName: destinationStationName
    )
  }

  private static func emptyState() -> MyCommuteLiveActivityAttributes.ContentState {
    MyCommuteLiveActivityAttributes.ContentState(
      lineName: "",
      statusSeverity: "good",
      statusText: "On time",
      severityTier: 0,
      nextTrainMinutes: 0,
      etaTimestamp: 0,
      etaDelta: "On time",
      isEscalated: false,
      detourLine: nil,
      detourMinutes: nil,
      detourStatus: nil,
      delayRepayEligible: false,
      estimatedFare: nil,
      delayMinutes: 0,
      tunnelState: "normal",
      progress: 0.0,
      segmentMaxDuration: 180,
      arrivals: nil,
      phase: "approaching",
      selectedEndpoint: nil,
      availableEndpoints: nil,
      branchName: nil,
      sessionStartTime: 0,
      currentStationName: nil,
      destinationStationName: nil
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
    if let userDefaults = UserDefaults(suiteName: appGroupId),
       let backendUrl = payload["backendUrl"] as? String, !backendUrl.isEmpty {
      userDefaults.set(backendUrl, forKey: "backendApiUrl")
      userDefaults.synchronize()
    }
    let slim: [String: Any] = [
      "stationId": payload["stationId"] ?? "",
      "lineId": payload["lineId"] ?? "",
      "lineName": payload["lineName"] ?? "",
      "statusText": payload["statusText"] ?? "On time",
      "severityTier": payload["severityTier"] ?? 0,
      "isEscalated": payload["isEscalated"] ?? false,
      "detourLine": payload["detourLine"] ?? "",
      "etaTimestamp": payload["etaTimestamp"] ?? 0,
      "tunnelState": payload["tunnelState"] ?? "normal"
    ]
    try? JSONSerialization.data(withJSONObject: slim).write(to: url)
  }

  private func clearMirror() {
    guard let url = mirrorURL() else { return }
    try? FileManager.default.removeItem(at: url)
  }
}
