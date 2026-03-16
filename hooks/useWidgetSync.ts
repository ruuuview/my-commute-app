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
        
        let parsed = [];
        if (Array.isArray(rawData)) parsed = rawData;
        else if (rawData?.myLines) parsed = rawData.myLines;
        else if (rawData?.lines) parsed = rawData.lines;

        if (!parsed || parsed.length === 0) {
          console.log('[WidgetSync] No saved lines found.');
          return;
        }

        // Strip everything. Force strings.
        const payload = parsed.map((line: any) => ({
          id: String(line.id || '').toLowerCase(),
          name: String(line.name || 'Unknown Line'),
        })).filter(line => line.id !== '');

        // THIS IS THE CONSOLE LOG WE NEED TO SEE
        console.log('[WidgetSync] RAW BRIDGE PAYLOAD:', JSON.stringify(payload, null, 2));

        // Write to App Group shared container using your existing function
        await syncToWidget(payload);
        console.log(`[WidgetSync] ✅ Synced ${payload.length} line(s) to widget container.`);

      } catch (error) {
        console.error('[WidgetSync] ❌ Sync failed:', error);
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