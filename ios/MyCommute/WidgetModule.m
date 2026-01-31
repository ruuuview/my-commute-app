#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(WidgetModule, NSObject)
  RCT_EXTERN_METHOD(reloadWidget:(NSString *)jsonString)
@end
