import { Platform } from 'react-native';
import SharedGroupPreferences from 'react-native-shared-group-preferences';
import { WidgetKit } from 'react-native-widgetkit';

const APP_GROUP = 'group.com.mycommute.app';

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
