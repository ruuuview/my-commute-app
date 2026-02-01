import * as React from 'react';

import { MyWidgetKickerViewProps } from './MyWidgetKicker.types';

export default function MyWidgetKickerView(props: MyWidgetKickerViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
