import { useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';

// Global singleton instances to prevent unloading/reloading during screen transitions
let globalSelectSound: Audio.Sound | null = null;
let globalDeselectSound: Audio.Sound | null = null;
let globalConfirmSound: Audio.Sound | null = null;
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
          require('../assets/audio/select.m4a'),
          { shouldPlay: false }
        );
        globalSelectSound = selectSound;

        const { sound: deselectSound } = await Audio.Sound.createAsync(
          require('../assets/audio/deselect.m4a'),
          { shouldPlay: false }
        );
        globalDeselectSound = deselectSound;

        const { sound: confirmSound } = await Audio.Sound.createAsync(
          require('../assets/audio/confirm.m4a'),
          { shouldPlay: false }
        );
        globalConfirmSound = confirmSound;
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

  const playConfirm = useCallback(async () => {
    try {
      if (!globalConfirmSound) return;
      const status = await globalConfirmSound.getStatusAsync();
      if (!status.isLoaded) return;
      await globalConfirmSound.setPositionAsync(0);
      await globalConfirmSound.playAsync();
    } catch (e) {
      console.log('Error playing confirm sound', e);
    }
  }, []);

  return { playSelect, playDeselect, playConfirm, playTap: playSelect };
}
