import SharedGroupPreferences from 'react-native-shared-group-preferences';

const APP_GROUP = 'group.com.mycommute.app';

export const syncToWidget = async (data: any[]) => {
  try {
    const lines = Array.isArray(data) ? data.filter(item => item.status_severity !== undefined) : [];
    
    if (lines.length === 0) {
       console.log("⚠️ Widget Sync: No lines to sync");
       return;
    }

    lines.sort((a, b) => b.status_severity - a.status_severity);
    const worstLine = lines[0];

    const statusText = `${worstLine.name}: ${worstLine.status}`;
    const severity = worstLine.status_severity;

    await SharedGroupPreferences.setItem('widget_line_status', statusText, APP_GROUP);
    await SharedGroupPreferences.setItem('widget_severity', severity, APP_GROUP);
    
    console.log(`✅ Widget Synced: ${statusText} (Severity: ${severity})`);
  } catch (error) {
    console.log('❌ Widget Sync Failed:', error);
  }
};
