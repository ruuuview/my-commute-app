#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(LiveActivityModule, NSObject)

RCT_EXTERN_METHOD(startCommuteActivity:(NSString *)destinationStation
                  destinationLine:(NSString *)destinationLine
                  estimatedArrivalSeconds:(double)estimatedArrivalSeconds
                  nextTrainMinutes:(NSInteger)nextTrainMinutes
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(updateCommuteActivity:(NSInteger)nextTrainMinutes
                  currentStatus:(NSString *)currentStatus
                  estimatedArrivalSeconds:(double)estimatedArrivalSeconds
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(endCommuteActivity:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(isActivityActive:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

@end
