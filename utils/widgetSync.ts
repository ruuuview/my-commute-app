import { Platform } from 'react-native';
import SharedGroupPreferences from 'react-native-shared-group-preferences';
import { WidgetKit } from 'react-native-widgetkit';

const APP_GROUP = 'group.com.mycommute.app';

// ============================================================
// MARK: - THE MASTER TfL COLOR PALETTE
// ============================================================
export const TfLColors = {
  good: {
    gradientStart: '#0F7338', 
    gradientEnd: '#08401F',   
    icon: '#21A64D',
    text: '#FFFFFF',
    textSecondary: 'rgba(255, 255, 255, 0.8)',
    divider: 'rgba(255, 255, 255, 0.3)',
  },
  minor: {
    gradientStart: '#FFD119', 
    gradientEnd: '#E6A600',   
    icon: '#D98C00',
    text: '#261A00',          // Near-black for maximum WCAG readability
    textSecondary: 'rgba(64, 38, 0, 0.85)',
    divider: 'rgba(0, 0, 0, 0.15)',
  },
  severe: {
    gradientStart: '#8F1414', 
    gradientEnd: '#520A0A',   
    icon: '#D92626',
    text: '#FFFFFF',
    textSecondary: 'rgba(255, 255, 255, 0.8)',
    divider: 'rgba(255, 255, 255, 0.3)',
  }
};

// Helper function to grab the right colors based on the TfL status
export const getSeverityTheme = (severityCode: number) => {
  if (severityCode >= 10) return TfLColors.good;
  if (severityCode >= 7 && severityCode <= 9) return TfLColors.minor;
  return TfLColors.severe;
};

// ============================================================
// MARK: - WIDGET SYNC ENGINE
// ============================================================
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