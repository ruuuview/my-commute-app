import ExpoModulesCore
import WidgetKit
import Foundation

public class MyWidgetKickerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MyWidgetKicker")

    Function("saveAndReload") { (jsonString: String) in
      // 1. Write to the App Group
      if let userDefaults = UserDefaults(suiteName: "group.com.mycommute.app") {
        userDefaults.set(jsonString, forKey: "widget_data_json")
        userDefaults.synchronize() 
        print("✅ Native: Data written to UserDefaults")
      } else {
        print("❌ Native: Could not access App Group")
      }

      // 2. Kick the Widget
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
        print("⚡️ Native: Widget reload triggered")
      }
    }
  }
}
