import { useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';

// Global singleton instances to prevent unloading/reloading during screen transitions
let globalSelectSound: Audio.Sound | null = null;
let globalDeselectSound: Audio.Sound | null = null;
let isAudioInitialized = false;
let isAudioInitializing = false;

export function useTapSound() {
  useEffect(() => {
    async function loadAudio() {
      if (isAudioInitialized || isAudioInitializing) return;
      isAudioInitializing = true;

      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: false });

        const { sound: selectSound } = await Audio.Sound.createAsync(
          require('../assets/audio/select.wav'),
          { shouldPlay: false }
        );
        globalSelectSound = selectSound;

        const { sound: deselectSound } = await Audio.Sound.createAsync(
          require('../assets/audio/deselect.wav'),
          { shouldPlay: false }
        );
        globalDeselectSound = deselectSound;
        isAudioInitialized = true;
      } catch (err) {
        console.log('Error initializing global audio singletons:', err);
      } finally {
        isAudioInitializing = false;
      }
    }

    loadAudio().catch(() => {});
  }, []);

  const playSelect = useCallback(async () => {
    try {
      if (!globalSelectSound) return;
      const status = await globalSelectSound.getStatusAsync();
      if (!status.isLoaded) return;
      await globalSelectSound.setPositionAsync(0);
      await globalSelectSound.playAsync();
    } catch (e) {
      console.log('Error playing select sound', e);
    }
  }, []);

  const playDeselect = useCallback(async () => {
    try {
      if (!globalDeselectSound) return;
      const status = await globalDeselectSound.getStatusAsync();
      if (!status.isLoaded) return;
      await globalDeselectSound.setPositionAsync(0);
      await globalDeselectSound.playAsync();
    } catch (e) {
      console.log('Error playing deselect sound', e);
    }
  }, []);

  return { playSelect, playDeselect, playTap: playSelect };
}
