import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import SharedGroupPreferences from 'react-native-shared-group-preferences';

const APP_GROUP = 'group.com.mycommute.app'; 

// Helper: Convert text status to a severity number
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
      // Trigger update when app opens (Background -> Active)
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        console.log("⚡️ App opened! Syncing widget...");
        await performSync();
      }
      appState.current = nextAppState;
    });

    // Also run immediately on mount
    performSync();

    return () => {
      subscription.remove();
    };
  }, []);

  const performSync = async () => {
    if (Platform.OS !== 'ios') return;

    try {
      // 1. Fetch fresh data
      const data = await fetchDataFunction(); 
      if (!data || !data.myLines || data.myLines.length === 0) return;

      // 2. SMART SORTING: Put the worst line first!
      const sortedLines = data.myLines.sort((a: any, b: any) => {
        const sevA = getSeverity(a.status);
        const sevB = getSeverity(b.status);
        return sevB - sevA; // Descending: 6 (Severe) -> 0 (Good)
      });

      const priorityLine = sortedLines[0];
      const statusString = `${priorityLine.name}: ${priorityLine.status}`;
      const severity = getSeverity(priorityLine.status);

      // 3. Save to Widget Storage
      await SharedGroupPreferences.setItem('widget_line_status', statusString, APP_GROUP);
      await SharedGroupPreferences.setItem('widget_severity', severity, APP_GROUP);

      console.log(`✅ Widget Saved Priority Line: ${statusString}`);

    } catch (error) {
      console.error("❌ Widget sync failed:", error);
    }
  };
};
