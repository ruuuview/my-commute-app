import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { syncToWidget } from '../utils/widgetSync';

export function useWidgetSync(fetchWidgetData: () => Promise<any>) {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    const subscription = AppState.addEventListener('change', async nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        if (fetchWidgetData) {
          const data = await fetchWidgetData();
          if (data && data.myLines) {
             await syncToWidget(data.myLines);
          }
        }
      }
      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, [fetchWidgetData]);
}
