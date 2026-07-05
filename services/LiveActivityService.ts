import { NativeModules, Platform } from 'react-native';

const { LiveActivityModule } = NativeModules;

export class LiveActivityService {
  /**
   * Starts a Live Activity for the commute.
   * @param destinationStation Name of the destination station (e.g. 'Brixton')
   * @param destinationLine ID of the line (e.g. 'victoria')
   * @param estimatedArrival Date object representing when the journey is expected to finish
   * @param nextTrainMinutes Minutes until the next train (e.g. 2)
   */
  static async start(
    destinationStation: string,
    destinationLine: string,
    estimatedArrival: Date,
    nextTrainMinutes: number
  ): Promise<string | null> {
    if (Platform.OS !== 'ios') return null;

    try {
      if (!LiveActivityModule || typeof LiveActivityModule.startCommuteActivity !== 'function') {
        console.warn('⚠️ LiveActivityModule.startCommuteActivity is not available.');
        return null;
      }

      const estimatedArrivalSeconds = Math.floor(estimatedArrival.getTime() / 1000);
      const activityId = await LiveActivityModule.startCommuteActivity(
        destinationStation,
        destinationLine,
        estimatedArrivalSeconds,
        nextTrainMinutes
      );
      console.log(`✅ LiveActivityService: Started activity with ID ${activityId}`);
      return activityId;
    } catch (error) {
      console.error('❌ LiveActivityService: Failed to start activity:', error);
      return null;
    }
  }

  /**
   * Updates the dynamic content of the active Live Activity.
   * @param nextTrainMinutes Updated minutes until the next train
   * @param currentStatus Description status string (e.g., 'Minor Delays' or 'Victoria line: Good service')
   * @param estimatedArrival Optional Date object if the ETA has changed/shifted
   */
  static async update(
    nextTrainMinutes: number,
    currentStatus: string,
    estimatedArrival?: Date
  ): Promise<void> {
    if (Platform.OS !== 'ios') return;

    try {
      if (!LiveActivityModule || typeof LiveActivityModule.updateCommuteActivity !== 'function') {
        console.warn('⚠️ LiveActivityModule.updateCommuteActivity is not available.');
        return;
      }

      const estimatedArrivalSeconds = estimatedArrival 
        ? Math.floor(estimatedArrival.getTime() / 1000) 
        : 0;

      await LiveActivityModule.updateCommuteActivity(
        nextTrainMinutes,
        currentStatus,
        estimatedArrivalSeconds
      );
      console.log('✅ LiveActivityService: Updated activity successfully');
    } catch (error) {
      console.error('❌ LiveActivityService: Failed to update activity:', error);
    }
  }

  /**
   * Ends all active commute Live Activities.
   */
  static async end(): Promise<void> {
    if (Platform.OS !== 'ios') return;

    try {
      if (!LiveActivityModule || typeof LiveActivityModule.endCommuteActivity !== 'function') {
        console.warn('⚠️ LiveActivityModule.endCommuteActivity is not available.');
        return;
      }

      await LiveActivityModule.endCommuteActivity();
      console.log('✅ LiveActivityService: Ended active activities');
    } catch (error) {
      console.error('❌ LiveActivityService: Failed to end activity:', error);
    }
  }

  /**
   * Returns whether a Live Activity is currently active.
   */
  static async isActive(): Promise<boolean> {
    if (Platform.OS !== 'ios') return false;

    try {
      if (!LiveActivityModule || typeof LiveActivityModule.isActivityActive !== 'function') {
        return false;
      }
      return await LiveActivityModule.isActivityActive();
    } catch (error) {
      console.error('❌ LiveActivityService: Failed to check activity status:', error);
      return false;
    }
  }
}
export default LiveActivityService;
