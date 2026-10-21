import { Platform } from 'react-native';

export const syncToWidget = async (selectedLines: string[]) => {
  if (Platform.OS !== 'ios') return;

  try {
    if (!selectedLines || !Array.isArray(selectedLines)) {
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { LiveActivityService } = require('../services/LiveActivityService');
    if (typeof LiveActivityService?.syncWidgetCache === 'function') {
      await LiveActivityService.syncWidgetCache(selectedLines);
    }
  } catch (error) {
    console.error('❌ Widget Sync Failed:', error);
  }
};