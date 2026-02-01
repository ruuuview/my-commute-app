import { registerWebModule, NativeModule } from 'expo';

import { ChangeEventPayload } from './MyWidgetKicker.types';

type MyWidgetKickerModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
}

class MyWidgetKickerModule extends NativeModule<MyWidgetKickerModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
};

export default registerWebModule(MyWidgetKickerModule, 'MyWidgetKickerModule');
