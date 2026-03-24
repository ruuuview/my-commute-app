import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';

const BACKGROUND_FETCH_TASK = 'background-fetch-task';

// Phase 1.3: Removed widget sync from background task.
// Widget sync is now strictly handled by push notifications and in-app useWidgetSync hook.
TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  return BackgroundFetch.BackgroundFetchResult.NoData;
});

export async function registerBackgroundFetchAsync() {
  return BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
    minimumInterval: 60 * 15,
    stopOnTerminate: false,
    startOnBoot: true,
  });
}
