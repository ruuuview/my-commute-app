import Foundation
import WidgetKit
import React

@objc(WidgetModule)
class WidgetModule: NSObject {
  
  @objc
  func reloadWidget(_ jsonString: String,
                    resolver resolve: @escaping RCTPromiseResolveBlock,
                    rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let userDefaults = UserDefaults(suiteName: "group.com.mycommute.app") else {
      reject("WIDGET_ERROR", "Failed to access shared UserDefaults group (group.com.mycommute.app)", nil)
      return
    }
    
    userDefaults.set(jsonString, forKey: "myLines")
    
    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
      print("⚡️ Widget Kicked: Reloading Timelines")
    }
    resolve(nil)
  }
  
  @objc
  func saveWidgetStatusCache(_ jsonString: String,
                             resolver resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let userDefaults = UserDefaults(suiteName: "group.com.mycommute.app") else {
      reject("WIDGET_ERROR", "Failed to access shared UserDefaults group (group.com.mycommute.app)", nil)
      return
    }
    
    userDefaults.set(jsonString, forKey: "cachedTfLStatus")
    
    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
      print("⚡️ Widget Status Cached: Reloading Timelines")
    }
    resolve(nil)
  }
  
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return true
  }
}
