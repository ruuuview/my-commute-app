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
        
        let parsed: any[] = [];
        if (Array.isArray(rawData)) parsed = rawData;
        else if (rawData?.myLines) parsed = rawData.myLines;
        else if (rawData?.lines) parsed = rawData.lines;
        else if (rawData?.data) parsed = rawData.data; // Added common fallback
        else if (rawData?.data?.lines) parsed = rawData.data.lines;

        let payload: any[] = [];
        if (parsed && parsed.length > 0) {
            payload = parsed.map((line: any) => ({
              id: String(line.id || '').toLowerCase(),
              name: String(line.name || 'Unknown Line'),
            })).filter(line => line.id !== '');
        }

        // 🚨 IF IT FAILS TO PARSE, DO NOT SILENTLY RETURN.
        // Force an error payload across the bridge so we can see it on the widget.
        if (payload.length === 0) {
            let errorString = JSON.stringify(rawData) || "Unknown Data Shape";
            payload = [{ 
                id: "bakerloo", // Fake ID so TfL API doesn't crash
                name: "Parse Error: " + errorString.substring(0, 20) 
            }];
        }

        await syncToWidget(payload);
      } catch (error: any) {
        await syncToWidget([{ id: "bakerloo", name: "JS Crash: " + String(error.message).substring(0,20) }]);
      }
    };

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