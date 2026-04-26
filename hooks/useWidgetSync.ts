import { useEffect } from 'react';
import { syncToWidget } from '../utils/widgetSync';

export const useWidgetSync = (rawData: any) => {
  useEffect(() => {
    const performSync = async () => {
      try {
        // Only attempt sync if we actually have data
        if (!rawData) return;

        await syncToWidget(rawData);
      } catch (error) {
        // PROTECT: Never use '+' with JSON.stringify on large objects
        // This prevents the 'stack buffer overflow' seen in Build 718 logs
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

    performSync();
  }, [rawData]);
};