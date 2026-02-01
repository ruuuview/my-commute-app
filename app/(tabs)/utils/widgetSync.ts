import * as MyWidgetKicker from '../../../modules/my-widget-kicker';
import { Platform } from 'react-native';

export const syncToWidget = async (data: any[]) => {
  try {
    if (Platform.OS !== 'ios') return;

    // 1. Prune Data
    const widgetData = data.slice(0, 5).map(line => ({
      id: line.id,
      name: line.name,
      status: line.status,
      severity: line.status_severity
    }));

    const jsonString = JSON.stringify(widgetData);
    
    // 2. CALL THE NATIVE MODULE (Save + Kick)
    MyWidgetKicker.saveAndReload(jsonString);
    
    console.log(`✅ ACTIVE FILE: Sent ${widgetData.length} lines to Native Module`);

  } catch (error) {
    console.error("❌ Widget Sync Failed:", error);
  }
};
