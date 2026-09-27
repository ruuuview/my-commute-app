// Vendored from rit3zh/expo-dynamic-notifications @ 5de059a (MIT License). Imports rewritten from @/ alias to relative paths.
function clamp<T extends number>(value: T, min: T, max: T): T {
  "worklet";

  return Math.min(Math.max(value, min), max) as T;
}

export { clamp };
