// frontend/targets/MyCommuteWidget/MyCommuteControlWidget.swift
// iOS 18 Control Center toggle widget for Shush Mode.

import WidgetKit
import SwiftUI
import AppIntents

@available(iOS 18.0, *)
public struct ToggleShushModeIntent: AppIntent {
  public static var title: LocalizedStringResource = "Toggle Shush Mode"
  public static var description = IntentDescription("Toggles silent ambient Live Activity commute updates.")

  public init() {}

  public func perform() async throws -> some IntentResult {
    if let userDefaults = UserDefaults(suiteName: "group.com.mycommute.app") {
      let current = userDefaults.string(forKey: "alertDeliveryMode") ?? "shush"
      let next = current == "shush" ? "loud" : "shush"
      userDefaults.set(next, forKey: "alertDeliveryMode")
      userDefaults.synchronize()
    }
    return .result()
  }
}

@available(iOS 18.0, *)
public struct MyCommuteControlWidget: ControlWidget {
  public static let kind: String = "com.mycommute.app.shush-toggle"

  public init() {}

  public var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: Self.kind) {
      ControlWidgetToggle(
        "Shush Mode",
        isOn: isShushActive,
        action: ToggleShushModeIntent()
      ) { isOn in
        Label(isOn ? "Shush Mode Active" : "Loud Mode", systemImage: isOn ? "bell.slash.fill" : "bell.fill")
      }
    }
    .displayName("Shush Mode")
    .description("Toggle silent ambient transit updates.")
  }

  private var isShushActive: Bool {
    guard let userDefaults = UserDefaults(suiteName: "group.com.mycommute.app") else { return true }
    let mode = userDefaults.string(forKey: "alertDeliveryMode") ?? "shush"
    return mode == "shush"
  }
}
