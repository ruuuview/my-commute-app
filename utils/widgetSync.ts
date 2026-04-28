import { MMKV } from 'react-native-mmkv';

let widgetStorage: MMKV | null = null;

export const syncToWidget = (data: any) => {
  try {
    if (!widgetStorage) {
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

    widgetStorage.set('widgetKey', JSON.stringify(widgetData));
    console.log('✅ Widget Sync Success (MMKV):', widgetData.items.length);

  } catch (error) {
    console.error('❌ Widget Sync Failed (Likely App Group Provisioning):', error);
  }
};