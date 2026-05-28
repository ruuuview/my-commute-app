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
      } catch (e) {
        console.log('Error setting audio mode:', e);
      }

      // 1. Load Select Sound
      try {
        const { sound } = await Audio.Sound.createAsync(
          require('../assets/audio/select.m4a'),
          { shouldPlay: false }
        );
        globalSelectSound = sound;
      } catch (err) {
        try {
          // Fallback to select.wav if m4a is empty/damaged
          const { sound } = await Audio.Sound.createAsync(
            require('../assets/audio/select.wav'),
            { shouldPlay: false }
          );
          globalSelectSound = sound;
        } catch (fallbackErr) {
          console.log('Failed to load select sound fallback:', fallbackErr);
        }
      }

      // 2. Load Deselect Sound
      try {
        const { sound } = await Audio.Sound.createAsync(
          require('../assets/audio/deselect.m4a'),
          { shouldPlay: false }
        );
        globalDeselectSound = sound;
      } catch (err) {
        try {
          // Fallback to deselect.wav if m4a is empty/damaged
          const { sound } = await Audio.Sound.createAsync(
            require('../assets/audio/deselect.wav'),
            { shouldPlay: false }
          );
          globalDeselectSound = sound;
        } catch (fallbackErr) {
          console.log('Failed to load deselect sound fallback:', fallbackErr);
        }
      }

      // 3. Load Confirm Sound
      try {
        const { sound } = await Audio.Sound.createAsync(
          require('../assets/audio/confirm.m4a'),
          { shouldPlay: false }
        );
        globalConfirmSound = sound;
      } catch (err) {
        try {
          // Fallback to tap.wav if confirm.m4a is empty/damaged
          const { sound } = await Audio.Sound.createAsync(
            require('../assets/audio/tap.wav'),
            { shouldPlay: false }
          );
          globalConfirmSound = sound;
        } catch (fallbackErr) {
          console.log('Failed to load confirm sound fallback:', fallbackErr);
        }
      }

      isAudioInitialized = true;
      isAudioInitializing = false;
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
