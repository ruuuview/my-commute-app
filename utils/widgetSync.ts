import { Platform } from 'react-native';
import SharedGroupPreferences from 'react-native-shared-group-preferences';
import { WidgetKit } from 'react-native-widgetkit';

const APP_GROUP = 'group.com.mycommute.app';

// The Master TfL Color Palette
export const TfLColors = {
  good: { gradientStart: '#0F7338', text: '#FFFFFF', icon: '#21A64D', textSecondary: 'rgba(255, 255, 255, 0.8)' },
  minor: { gradientStart: '#FFD119', text: '#261A00', icon: '#D98C00', textSecondary: 'rgba(64, 38, 0, 0.85)' },
  severe: { gradientStart: '#E65C00', text: '#FFFFFF', icon: '#E65C00', textSecondary: 'rgba(255, 255, 255, 0.8)' },
  suspended: { gradientStart: '#8F1414', text: '#FFFFFF', icon: '#D92626', textSecondary: 'rgba(255, 255, 255, 0.8)' }
};

// The Single Source of Truth for UX
export const getSeverityTheme = (severityCode: number) => {
  if (severityCode <= 2) return { ...TfLColors.good, iconName: 'checkmark' as const, label: 'Good Service' };
  if (severityCode <= 5) return { ...TfLColors.minor, iconName: 'warning' as const, label: 'Minor Delays' };
  if (severityCode <= 9) return { ...TfLColors.severe, iconName: 'time' as const, label: 'Severe Delays' };
  return { ...TfLColors.suspended, iconName: 'close' as const, label: 'Suspended' };
};

// Widget Sync Engine
export async function syncToWidget(lines: any) {
  if (Platform.OS !== 'ios') return;
  try {
    await SharedGroupPreferences.setItem('myLines', JSON.stringify(lines), APP_GROUP);
    WidgetKit.reloadAllTimelines();
    console.log('✅ Widget Sync Complete');
  } catch (error) {
    console.log("❌ Widget sync error:", error);
  }
}
