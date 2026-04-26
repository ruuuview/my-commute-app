import SharedGroupPreferences from 'react-native-shared-group-preferences';

const APP_GROUP_ID = 'group.com.mycommute.app';

export const syncToWidget = async (data: any) => {
  try {
    // Hermes Safety Check: Ensure we have an array
    const linesArray: any[] = Array.isArray(data) 
      ? data 
      : data?.myLines ?? data?.lines ?? [];

    const widgetData = {
      lastUpdated: new Date().toISOString(),
      items: linesArray.slice(0, 6).map((item: any) => ({
        id: item.id || item.stationId || 'unknown',
        title: item.name || item.routeName || 'Unknown',
        status: item.status || 'On Time',
        color: item.color || '#007AFF',
      })),
    };

    await SharedGroupPreferences.setItem(
      'widgetKey',
      widgetData,
      APP_GROUP_ID
    );
  } catch (error) {
    console.error('Widget Sync Failed:', error);
  }
};