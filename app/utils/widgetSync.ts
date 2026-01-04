import SharedGroupPreferences from 'react-native-shared-group-preferences';

const APP_GROUP = 'group.com.mycommute.app';

export const syncToWidget = async (data: any[]) => {
  try {
    // 1. Filter for Lines (ignore Stations)
    const lines = data.filter(item => item.status_severity !== undefined);
    
    // Silent exit if no lines (e.g. only stations)
    if (lines.length === 0) return;

    // 2. Sort by Severity (Red/High first)
    lines.sort((a, b) => b.status_severity - a.status_severity);
    const worstLine = lines[0];

    // 3. Format Data
    const statusText = `${worstLine.name}: ${worstLine.status}`;
    const severity = worstLine.status_severity;

    // 4. Save silently
    await SharedGroupPreferences.setItem('widget_line_status', statusText, APP_GROUP);
    await SharedGroupPreferences.setItem('widget_severity', severity, APP_GROUP);
    
    console.log('✅ Widget Synced:', statusText);
  } catch (error) {
    console.log('❌ Widget Sync Failed:', error);
  }
};
