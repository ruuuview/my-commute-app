import { NativeModules, Platform } from 'react-native';
import { LINE_SHORT_NAMES } from '../data/lineMetadata';

const { WidgetModule } = NativeModules;

export const syncToWidget = (selectedLines: string[]) => {
  if (Platform.OS !== 'ios') return;

  try {
    if (!selectedLines || !Array.isArray(selectedLines)) {
      console.log('⚠️ Widget Sync: No selected lines array provided.');
      return;
    }

    // Map selected lines to the structure expected by the Swift widget: SavedLine[]
    const savedLines = selectedLines.map(id => ({
      id,
      name: LINE_SHORT_NAMES[id] || (id.charAt(0).toUpperCase() + id.slice(1)),
    }));

    const jsonString = JSON.stringify(savedLines);

    if (WidgetModule && typeof WidgetModule.reloadWidget === 'function') {
      WidgetModule.reloadWidget(jsonString);
      console.log('✅ Widget Sync Succeeded:', savedLines.length, 'lines.');
    } else {
      console.warn('⚠️ Widget Sync: WidgetModule.reloadWidget is not available.');
    }
  } catch (error) {
    console.error('❌ Widget Sync Failed:', error);
  }
};