import Foundation
import WidgetKit
import React

@objc(WidgetModule)
class WidgetModule: NSObject {
  
  @objc
  func reloadWidget(_ jsonString: String) {
    // 1. Force Write to Shared Group
    if let userDefaults = UserDefaults(suiteName: "group.com.mycommute.app") {
      userDefaults.set(jsonString, forKey: "myLines")
    }
    
    // 2. KICK the Widget (Force Reload)
    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
      print("⚡️ Widget Kicked: Reloading Timelines")
    }
  }
  
  @objc
  func saveWidgetStatusCache(_ jsonString: String) {
    if let userDefaults = UserDefaults(suiteName: "group.com.mycommute.app") {
      userDefaults.set(jsonString, forKey: "cachedTfLStatus")
      
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
        print("⚡️ Widget Status Cached: Reloading Timelines")
      }
    }
  }
  
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return true
  }
}
