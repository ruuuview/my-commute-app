import { useCallback, useEffect } from 'react';
import { createAudioPlayer } from 'expo-audio';

// Global singleton instances to prevent unloading/reloading during screen transitions
let globalSelectSound: ReturnType<typeof createAudioPlayer> | null = null;
let globalDeselectSound: ReturnType<typeof createAudioPlayer> | null = null;
let globalConfirmSound: ReturnType<typeof createAudioPlayer> | null = null;
let isAudioInitialized = false;
let isAudioInitializing = false;

export function useTapSound() {
  useEffect(() => {
    async function loadAudio() {
      if (isAudioInitialized || isAudioInitializing) return;
      isAudioInitializing = true;

      // 1. Load Select Sound
      try {
        globalSelectSound = createAudioPlayer(require('../assets/audio/select.m4a'));
      } catch (err) {
        try {
          // Fallback to select.wav if m4a is empty/damaged
          globalSelectSound = createAudioPlayer(require('../assets/audio/select.wav'));
        } catch (fallbackErr) {
          console.log('Failed to load select sound fallback:', fallbackErr);
        }
      }

      // 2. Load Deselect Sound
      try {
        globalDeselectSound = createAudioPlayer(require('../assets/audio/deselect.m4a'));
      } catch (err) {
        try {
          // Fallback to deselect.wav if m4a is empty/damaged
          globalDeselectSound = createAudioPlayer(require('../assets/audio/deselect.wav'));
        } catch (fallbackErr) {
          console.log('Failed to load deselect sound fallback:', fallbackErr);
        }
      }

      // 3. Load Confirm Sound
      try {
        globalConfirmSound = createAudioPlayer(require('../assets/audio/confirm.m4a'));
      } catch (err) {
        try {
          // Fallback to tap.wav if confirm.m4a is empty/damaged
          globalConfirmSound = createAudioPlayer(require('../assets/audio/tap.wav'));
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
      globalSelectSound.seekTo(0);
      globalSelectSound.play();
    } catch (e) {
      console.log('Error playing select sound', e);
    }
  }, []);

  const playDeselect = useCallback(async () => {
    try {
      if (!globalDeselectSound) return;
      globalDeselectSound.seekTo(0);
      globalDeselectSound.play();
    } catch (e) {
      console.log('Error playing deselect sound', e);
    }
  }, []);

  const playConfirm = useCallback(async () => {
    try {
      if (!globalConfirmSound) return;
      globalConfirmSound.seekTo(0);
      globalConfirmSound.play();
    } catch (e) {
      console.log('Error playing confirm sound', e);
    }
  }, []);

  return { playSelect, playDeselect, playConfirm, playTap: playSelect };
}
