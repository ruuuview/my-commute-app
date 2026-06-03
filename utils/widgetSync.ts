import type { MMKV as MMKVType } from 'react-native-mmkv';
const { MMKV } = require('react-native-mmkv');

// We use the Type here for safety
let widgetStorage: MMKVType | null = null;

export const syncToWidget = (data: any) => {
  try {
    if (!widgetStorage) {
      // We use the Value here to actually build the car
      widgetStorage = new MMKV({
        id: 'widget-storage',
        appGroup: 'group.com.mycommute.app',
      });
    }

    const linesArray: any[] = Array.isArray(data) 
      ? data 
      : data?.myLines ?? data?.lines ?? [];

    const widgetData = {
      lastUpdated: new Date().toISOString(),
      items: linesArray.slice(0, 6).map((item: any) => ({
        id: String(item.id || item.stationId || 'unknown'),
        title: String(item.name || item.routeName || 'Unknown'),
        status: String(item.status || 'On Time'),
        color: String(item.color || '#007AFF'),
      })),
    };

    // TODO: re-enable after App Group provisioning confirmed
    // widgetStorage?.set('widgetKey', JSON.stringify(widgetData));
    console.log('⚠️ Widget Sync Bypassed (App Group provisioning pending):', widgetData.items.length);

  } catch (error) {
    console.error('❌ Widget Sync Failed (Likely App Group Provisioning):', error);
  }
};