import Foundation
import WidgetKit
import React

@objc(WidgetHelper)
class WidgetHelper: NSObject {
  
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc
  func reloadWidget(_ jsonString: String, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    // 1. Validate App Group Access
    guard let userDefaults = UserDefaults(suiteName: "group.com.mycommute.app") else {
      rejecter("E_DEFAULTS", "Could not access app group", nil)
      return
    }
    
    // 2. Save Data
    userDefaults.set(jsonString, forKey: "widget_data_json")
    userDefaults.synchronize()
    
    // 3. Reload Timelines
    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadTimelines(ofKind: "CommuteWidget")
    }
    
    resolver(true)
  }
}
