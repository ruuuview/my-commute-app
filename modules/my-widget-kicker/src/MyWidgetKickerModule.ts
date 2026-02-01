import { NativeModule, requireNativeModule } from 'expo';

import { MyWidgetKickerModuleEvents } from './MyWidgetKicker.types';

declare class MyWidgetKickerModule extends NativeModule<MyWidgetKickerModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<MyWidgetKickerModule>('MyWidgetKicker');
