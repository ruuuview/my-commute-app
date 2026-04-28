import { MMKV } from 'react-native-mmkv';

// Initialize MMKV specifically for your App Group
const widgetStorage = new MMKV({
  id: 'widget-storage',
  appGroup: 'group.com.mycommute.app',
});

export const syncToWidget = (data: any) => {
  try {
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

    // Synchronous write. No bridge errors, no memory crashes.
    widgetStorage.set('widgetKey', JSON.stringify(widgetData));

    console.log('✅ Widget Sync Success (MMKV):', widgetData.items.length);
  } catch (error) {
    console.error('❌ Widget Sync Failed:', error);
  }
};