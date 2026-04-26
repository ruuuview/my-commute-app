import AsyncStorage from '@react-native-async-storage/async-storage';
// @ts-ignore
import { SharedGroupPreferences } from 'react-native-shared-group-preferences';

const GROUP_ID = 'group.com.yourname.mycommute';

export const TfLColors = {
  good: { background: '#28A745', text: '#FFFFFF', icon: 'checkmark', severity: 10 },
  minor: { background: '#FFBF00', text: '#FFFFFF', icon: 'clock', severity: 9 },
  severe: { background: '#DC3545', text: '#FFFFFF', icon: 'warning', severity: 7 },
  suspended: { background: '#E32017', text: '#FFFFFF', icon: 'close', severity: 0 },
};

export const getSeverityTheme = (severity: number) => {
  if (severity >= 10 || severity === 18) {
    return { gradientStart: TfLColors.good.background, text: '#FFFFFF', textSecondary: 'rgba(255,255,255,0.8)', icon: '#28A745', iconName: 'checkmark' };
  }
  if (severity === 9 || severity === 14 || severity === 19) {
    return { gradientStart: TfLColors.minor.background, text: '#FFFFFF', textSecondary: 'rgba(255,255,255,0.8)', icon: '#FFBF00', iconName: 'time' };
  }
  if (severity >= 6 && severity <= 8) {
    return { gradientStart: TfLColors.severe.background, text: '#FFFFFF', textSecondary: 'rgba(255,255,255,0.8)', icon: '#DC3545', iconName: 'warning' };
  }
  return { gradientStart: TfLColors.suspended.background, text: '#FFFFFF', textSecondary: 'rgba(255,255,255,0.8)', icon: '#E32017', iconName: 'close' };
};

export const syncToWidget = async (data: any) => {
  try {
    const linesArray = Array.isArray(data) ? data : data?.myLines || [];
    const widgetData = {
      lastUpdated: new Date().toISOString(),
      lines: linesArray.map((l: any) => ({
        id: l.id,
        name: l.name,
        status: l.status || 'Unknown',
        color: l.status_color || getSeverityTheme(l.status_severity ?? 10).gradientStart,
        icon: l.status_icon || getSeverityTheme(l.status_severity ?? 10).iconName,
      }))
    };
    await SharedGroupPreferences.setItem('widgetData', widgetData, GROUP_ID);
    console.log('Widget Sync Successful:', widgetData.lines.length, 'lines sent.');
  } catch (error) {
    console.warn('Widget Sync Failed:', error);
  }
};