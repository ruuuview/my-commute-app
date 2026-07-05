import Foundation
import ActivityKit
import React

@objc(LiveActivityModule)
class LiveActivityModule: NSObject {
  
  private var currentActivity: Activity<CommuteActivityAttributes>? = nil
  
  @objc
  func startCommuteActivity(_ destinationStation: String,
                            destinationLine: String,
                            estimatedArrivalSeconds: Double,
                            nextTrainMinutes: Int,
                            resolver resolve: @escaping RCTPromiseResolveBlock,
                            rejecter reject: @escaping RCTPromiseRejectBlock) {
    
    guard #available(iOS 16.1, *) else {
      reject("UNSUPPORTED", "Live Activities are only supported on iOS 16.1+", nil)
      return
    }
    
    // Check if ActivityKit is enabled
    guard ActivityAuthorizationInfo().areActivitiesEnabled else {
      reject("DISABLED", "Live Activities are disabled by the user or system", nil)
      return
    }
    
    // Check if there is already an active activity and end it
    endExistingActivity()
    
    let arrivalDate = Date(timeIntervalSince1970: estimatedArrivalSeconds)
    
    let attributes = CommuteActivityAttributes(
      destinationStation: destinationStation,
      destinationLine: destinationLine
    )
    
    let state = CommuteActivityAttributes.ContentState(
      estimatedArrival: arrivalDate,
      nextTrainMinutes: nextTrainMinutes,
      currentStatus: "Tracking commute..."
    )
    
    do {
      let activity = try Activity<CommuteActivityAttributes>.request(
        attributes: attributes,
        contentState: state,
        pushType: nil
      )
      self.currentActivity = activity
      print("⚡️ Live Activity started successfully: \(activity.id)")
      resolve(activity.id)
    } catch {
      reject("START_ERROR", "Failed to start Live Activity: \(error.localizedDescription)", error)
    }
  }
  
  @objc
  func updateCommuteActivity(_ nextTrainMinutes: Int,
                             currentStatus: String,
                             estimatedArrivalSeconds: Double,
                             resolver resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 16.1, *) else {
      resolve(nil)
      return
    }
    
    let activity = self.currentActivity ?? Activity<CommuteActivityAttributes>.activities.first
    
    guard let activeActivity = activity else {
      reject("NO_ACTIVITY", "No active Live Activity to update", nil)
      return
    }
    
    Task {
      let arrivalDate = estimatedArrivalSeconds > 0 
        ? Date(timeIntervalSince1970: estimatedArrivalSeconds) 
        : activeActivity.contentState.estimatedArrival
        
      let updatedState = CommuteActivityAttributes.ContentState(
        estimatedArrival: arrivalDate,
        nextTrainMinutes: nextTrainMinutes,
        currentStatus: currentStatus
      )
      
      await activeActivity.update(using: updatedState)
      print("⚡️ Live Activity updated: \(activeActivity.id)")
      resolve(nil)
    }
  }
  
  @objc
  func endCommuteActivity(_ resolve: @escaping RCTPromiseResolveBlock,
                          rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 16.1, *) else {
      resolve(nil)
      return
    }
    
    let activities = Activity<CommuteActivityAttributes>.activities
    if activities.isEmpty {
      resolve(nil)
      return
    }
    
    Task {
      for activity in activities {
        await activity.end(dismissPolicy: .immediate)
        print("⚡️ Live Activity ended: \(activity.id)")
      }
      self.currentActivity = nil
      resolve(nil)
    }
  }
  
  @objc
  func isActivityActive(_ resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 16.1, *) else {
      resolve(false)
      return
    }
    let isActive = !Activity<CommuteActivityAttributes>.activities.isEmpty
    resolve(isActive)
  }
  
  private func endExistingActivity() {
    guard #available(iOS 16.1, *) else { return }
    let activities = Activity<CommuteActivityAttributes>.activities
    for activity in activities {
      Task {
        await activity.end(dismissPolicy: .immediate)
      }
    }
    self.currentActivity = nil
  }
  
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return true
  }
}
