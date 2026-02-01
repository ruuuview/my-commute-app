import { NativeModules } from 'react-native';
import SharedGroupPreferences from 'react-native-shared-group-preferences';

const APP_GROUP = 'group.com.mycommute.app';

export const syncToWidget = async (lines: any[]) => {
  try {
    // 1. Prepare Data
    const widgetData = lines.slice(0, 5).map(line => ({
      id: line.id,
      name: line.name,
      status: line.statusDescription || line.status || "Unknown",
      severity: 0, 
      lastUpdated: Date.now()
    }));

    const jsonString = JSON.stringify(widgetData);
    console.log(`🔄 Syncing ${widgetData.length} lines to Widget...`);

    // 2. Try Native Direct Channel (Fastest)
    if (NativeModules.WidgetHelper) {
      try {
        await NativeModules.WidgetHelper.reloadWidget(jsonString);
        console.log("✅ Widget refreshed instantly via Native Module.");
        return;
      } catch (nativeErr) {
        console.warn("⚠️ Native WidgetHelper failed, falling back to SharedPrefs:", nativeErr);
      }
    }

    // 3. Fallback
    console.log("⚠️ Falling back to SharedGroupPreferences");
    await SharedGroupPreferences.setItem('widget_data_json', jsonString, APP_GROUP);

  } catch (error) {
    console.error('❌ Widget Sync Failed:', error);
  }
};
