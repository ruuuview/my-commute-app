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
        
        // Safely extract the array
        let lines = [];
        if (Array.isArray(rawData)) lines = rawData;
        else if (rawData?.myLines) lines = rawData.myLines;
        else if (rawData?.lines) lines = rawData.lines;

        // ONLY sync if we have actual real data (No more fake X-Ray data!)
        if (lines && lines.length > 0) {
            await syncToWidget(lines);
        }
      } catch (e: any) {
        console.log("Widget sync error:", e);
      }
    };

    // Fire when the app opens
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