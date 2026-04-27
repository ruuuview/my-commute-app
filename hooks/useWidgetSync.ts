import { useEffect } from 'react';
import { syncToWidget } from '../utils/widgetSync';

export const useWidgetSync = (rawData: any) => {
  useEffect(() => {
    const performSync = async () => {
      try {
        if (!rawData) return;

        await syncToWidget(rawData);
      } catch (error) {
        // PROTECT: Never concatenate JSON.stringify with large strings.
        // This prevents the stack buffer overflow crash seen in libsystem_c.dylib.
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