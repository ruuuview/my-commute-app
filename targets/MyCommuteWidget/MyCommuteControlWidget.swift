// frontend/targets/MyCommuteWidget/MyCommuteControlWidget.swift
// iOS 18 Control Center toggle widget for Shush Mode.

import WidgetKit
import SwiftUI
import AppIntents

@available(iOS 18.0, *)
public struct ShushModeValueProvider: ControlValueProvider {
  public var previewValue: Bool { true }

  public init() {}

  public func currentValue() async throws -> Bool {
    guard let userDefaults = UserDefaults(suiteName: "group.com.mycommute.app") else { return true }
    let mode = userDefaults.string(forKey: "alertDeliveryMode") ?? "shush"
    return mode == "shush"
  }
}

@available(iOS 18.0, *)
public struct ToggleShushModeIntent: SetValueIntent {
  public static var title: LocalizedStringResource = "Toggle Shush Mode"
  public static var description = IntentDescription("Toggles silent ambient Live Activity commute updates.")

  @Parameter(title: "Shush Mode Active")
  public var value: Bool

  public init() {
    self.value = false
  }

  public init(value: Bool) {
    self.value = value
  }

  public func perform() async throws -> some IntentResult {
    if let userDefaults = UserDefaults(suiteName: "group.com.mycommute.app") {
      let next = value ? "shush" : "loud"
      userDefaults.set(next, forKey: "alertDeliveryMode")
    }
    return .result()
  }
}

@available(iOS 18.0, *)
public struct MyCommuteControlWidget: ControlWidget {
  public static let kind: String = "com.mycommute.app.shush-toggle"

  public init() {}

  public var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(
      kind: Self.kind,
      provider: ShushModeValueProvider()
    ) { isActive in
      ControlWidgetToggle(
        "Shush Mode",
        isOn: isActive,
        action: ToggleShushModeIntent(),
        valueLabel: { isOn in
          Label(isOn ? "Shush Mode Active" : "Loud Mode", systemImage: isOn ? "bell.slash.fill" : "bell.fill")
        }
      )
    }
    .displayName("Shush Mode")
    .description("Toggle silent ambient transit updates.")
  }
}

