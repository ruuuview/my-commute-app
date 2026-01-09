import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import SharedGroupPreferences from 'react-native-shared-group-preferences';

const APP_GROUP = 'group.com.mycommute.app'; 

const getSeverity = (status: string | null | undefined): number => {
  if (!status) return 0;
  const s = status.toLowerCase();
  if (s.includes("severe") || s.includes("suspended") || s.includes("closed")) return 6;
  if (s.includes("minor") || s.includes("delays")) return 3;
  return 0; // Good Service
};

export const useWidgetSync = (fetchDataFunction: () => Promise<any>) => {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        console.log("⚡️ App opened! Syncing widget...");
        await performSync();
      }
      appState.current = nextAppState;
    });

    performSync();

    return () => {
      subscription.remove();
    };
  }, []);

  const performSync = async () => {
    if (Platform.OS !== 'ios') return;

    try {
      const data = await fetchDataFunction(); 
      if (!data || !data.myLines || data.myLines.length === 0) return;

      const line = data.myLines[0]; 
      const statusString = `${line.name}: ${line.status}`;
      const severity = getSeverity(line.status);

      await SharedGroupPreferences.setItem('widget_line_status', statusString, APP_GROUP);
      await SharedGroupPreferences.setItem('widget_severity', severity, APP_GROUP);

      console.log(`✅ Widget Data Saved: ${statusString}`);

    } catch (error) {
      console.error("❌ Widget sync failed:", error);
    }
  };
};
