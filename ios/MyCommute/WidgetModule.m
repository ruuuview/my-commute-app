#import <TargetConditionals.h>

#if TARGET_OS_IPHONE

#if __has_include(<React/RCTBridgeModule.h>)
#import <React/RCTBridgeModule.h>
#else
#import "../../node_modules/react-native/React/Base/RCTBridgeModule.h"
#endif

@interface RCT_EXTERN_MODULE(WidgetModule, NSObject)
  RCT_EXTERN_METHOD(reloadWidget:(NSString *)jsonString)
  RCT_EXTERN_METHOD(saveWidgetStatusCache:(NSString *)jsonString)
@end

#endif
