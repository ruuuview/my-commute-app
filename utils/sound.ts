// utils/sound.ts
import { Audio } from 'expo-av';

const cache: Record<string, Audio.Sound> = {};

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
      const { sound } = await Audio.Sound.createAsync(source, { shouldPlay: false });
      cache[key] = sound;
    } catch (e) {
      console.log(`Failed to preload sound ${key}:`, e);
    }
  }
}

export async function playSound(name: keyof typeof cache, volume = 1.0) {
  try {
    const sound = cache[name];
    if (!sound) return;
    await sound.setVolumeAsync(volume);
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch (e) {
    console.log(`Error playing sound ${name}:`, e);
  }
}
