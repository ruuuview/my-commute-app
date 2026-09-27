// Vendored from rit3zh/expo-dynamic-notifications @ 5de059a (MIT License). Imports rewritten from @/ alias to relative paths.
import type { IBuildGooMatrix } from '../interfaces/notification-gooey.interface';

function buildGooMatrix({ gain, threshold }: IBuildGooMatrix): number[] {
  return [
    1, 0, 0, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, 1, 0, 0,
    0, 0, 0, gain, -gain * threshold,
  ];
}

export { buildGooMatrix };
