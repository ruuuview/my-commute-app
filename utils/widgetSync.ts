import SharedGroupPreferences from 'react-native-shared-group-preferences';

const APP_GROUP_ID = 'group.com.mycommute.app';

export const syncToWidget = async (data: any) => {
  try {
    // PROTECT: Ensure we have an array to prevent Hermes HiddenClass segfaults
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

    // SAFE LOG: Use commas, not '+' to prevent stack overflows
    console.log('✅ Widget Sync Success:', widgetData.items.length);
  } catch (error) {
    console.error('❌ Widget Sync Failed:', error);
  }
};