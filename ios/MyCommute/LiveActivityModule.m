#import <TargetConditionals.h>

#if TARGET_OS_IPHONE

#if __has_include(<React/RCTBridgeModule.h>)
#import <React/RCTBridgeModule.h>
#else
#import "../../node_modules/react-native/React/Base/RCTBridgeModule.h"
#endif

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

@end

#endif
