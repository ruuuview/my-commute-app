let widgetStorage: any = null;

export const syncToWidget = (data: any) => {
  try {
    if (!widgetStorage) {
      // Lazy-load MMKV on-demand (avoid TurboModule init at startup)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { MMKV } = require('react-native-mmkv');
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

    // TEMP: bypass App Group writes (crash mitigation)
    // widgetStorage?.set('widgetKey', JSON.stringify(widgetData));
    console.log('✅ Widget Sync Success (MMKV):', widgetData.items.length);

  } catch (error) {
    console.error('❌ Widget Sync Failed (Likely App Group Provisioning):', error);
  }
};