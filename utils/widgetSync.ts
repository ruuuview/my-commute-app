import { Platform } from 'react-native';
import LiveActivityService from '../services/LiveActivityService';

export const syncToWidget = async (selectedLines: string[]) => {
  if (Platform.OS !== 'ios') return;

  try {
    if (!selectedLines || !Array.isArray(selectedLines)) {
      return;
    }
    if (typeof LiveActivityService?.syncWidgetCache === 'function') {
      await LiveActivityService.syncWidgetCache(selectedLines);
    }
  } catch (error) {
    console.error('❌ Widget Sync Failed:', error);
  }
};