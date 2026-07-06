#import <TargetConditionals.h>

#if TARGET_OS_IPHONE

#if __has_include(<React/RCTBridgeModule.h>)
#import <React/RCTBridgeModule.h>
#else
#import "../../node_modules/react-native/React/Base/RCTBridgeModule.h"
#endif

@interface RCT_EXTERN_MODULE(LiveActivityModule, NSObject)

RCT_EXTERN_METHOD(startCommuteActivity:(NSString *)originStation
                  destinationStation:(NSString *)destinationStation
                  lineId:(NSString *)lineId
                  lineName:(NSString *)lineName
                  nextTrainMinutes:(NSInteger)nextTrainMinutes
                  followingTrainMinutes:(NSInteger)followingTrainMinutes
                  lineStatus:(NSString *)lineStatus
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(updateCommuteActivity:(NSInteger)nextTrainMinutes
                  followingTrainMinutes:(NSInteger)followingTrainMinutes
                  lineStatus:(NSString *)lineStatus
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(endCommuteActivity:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(isActivityActive:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end

#endif
