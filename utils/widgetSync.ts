import SharedGroupPreferences from 'react-native-shared-group-preferences';

const APP_GROUP_ID = 'group.com.mycommute.app';

export const syncToWidget = async (data: any) => {
  try {
    // Array Guard: Prevents Hermes HiddenClass EXC_BAD_ACCESS
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

    await SharedGroupPreferences.setItem(
      'widgetKey',
      widgetData,
      APP_GROUP_ID
    );

    // Memory Safe Log: Using commas instead of string concatenation
    console.log('✅ Widget Sync Success:', widgetData.items.length);
  } catch (error) {
    console.error('❌ Widget Sync Failed:', error);
  }
};