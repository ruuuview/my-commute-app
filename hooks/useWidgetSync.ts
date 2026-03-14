import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { syncToWidget } from '../utils/widgetSync';

export function useWidgetSync(fetchWidgetData: () => Promise<any>) {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    const pushData = async () => {
      try {
        const rawData = await fetchWidgetData();
        
        // Safely extract the array no matter how the backend formats it
        let lines = [];
        if (Array.isArray(rawData)) lines = rawData;
        else if (rawData?.myLines) lines = rawData.myLines;
        else if (rawData?.lines) lines = rawData.lines;

        // X-RAY FALLBACK: If your API is empty, force this fake line to prove the bridge works
        if (!lines || lines.length === 0) {
            lines = [{ id: "test-1", name: "Bridge Working!", status: "Backend sent no data", severity: 0 }];
        }

        await syncToWidget(lines);
      } catch (e: any) {
        // If JS fails, send the error to the widget!
        await syncToWidget([{ id: "error", name: "JS Error", status: e.message || "Unknown JS Error", severity: 2 }]);
      }
    };

    // Fire IMMEDIATELY when the app opens
    pushData();

    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
         pushData();
      }
      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, [fetchWidgetData]);
}