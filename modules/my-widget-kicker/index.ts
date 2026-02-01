import { requireNativeModule } from 'expo-modules-core';

const MyWidgetKicker = requireNativeModule('MyWidgetKicker');

export function saveAndReload(jsonString: string) {
  return MyWidgetKicker.saveAndReload(jsonString);
}
