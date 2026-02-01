import { requireNativeView } from 'expo';
import * as React from 'react';

import { MyWidgetKickerViewProps } from './MyWidgetKicker.types';

const NativeView: React.ComponentType<MyWidgetKickerViewProps> =
  requireNativeView('MyWidgetKicker');

export default function MyWidgetKickerView(props: MyWidgetKickerViewProps) {
  return <NativeView {...props} />;
}
