// utils/sound.ts
import { createAudioPlayer } from 'expo-audio';

const cache: Record<string, ReturnType<typeof createAudioPlayer>> = {};

export async function preloadSounds() {
  const files = {
    select:     require('../assets/sounds/select.m4a'),
    deselect:   require('../assets/sounds/deselect.m4a'),
    confirm:    require('../assets/sounds/confirm.m4a'),
    disruption: require('../assets/sounds/disruption.m4a'),
    arrival:    require('../assets/sounds/arrival.m4a'),
    error:      require('../assets/sounds/error.m4a'),
    push:       require('../assets/sounds/push.m4a'),
    pop:        require('../assets/sounds/pop.m4a'),
  };
  
  for (const [key, source] of Object.entries(files)) {
    try {
      const player = createAudioPlayer(source);
      cache[key] = player;
    } catch (e) {
      console.log(`Failed to preload sound ${key}:`, e);
    }
  }
}

export async function playSound(name: keyof typeof cache, volume = 1.0) {
  try {
    const player = cache[name];
    if (!player) return;
    player.volume = volume;
    player.seekTo(0);
    player.play();
  } catch (e) {
    console.log(`Error playing sound ${name}:`, e);
  }
}
