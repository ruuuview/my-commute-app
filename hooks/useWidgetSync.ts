import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { syncToWidget } from '../utils/widgetSync';

export const useWidgetSync = (rawData: any) => {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    const performSync = async () => {
      try {
        if (!rawData) return;
        await syncToWidget(rawData);
      } catch (error) {
        console.error("Widget Hook Error:", error);
        
        const errorPayload = [{
          id: "error",
          name: "Sync Error",
          status: "Failed",
          color: "#FF3B30"
        }];
        
        await syncToWidget(errorPayload);
      }
    };

    // The 2-second Cold Boot Guard
    const startupDelay = setTimeout(() => {
      performSync();
    }, 2000);

    const subscription = AppState.addEventListener('change', nextAppState => {
      if (String(appState.current ?? '').match(/inactive|background/) && nextAppState === 'active') {
        performSync();
      }
      appState.current = nextAppState;
    });

    return () => {
      clearTimeout(startupDelay);
      subscription.remove();
    };
  }, [rawData]);
};