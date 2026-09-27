// Vendored from rit3zh/expo-dynamic-notifications @ 5de059a (MIT License). Imports rewritten from @/ alias to relative paths.
function mix<T extends number>(progress: number, from: T, to: T): number {
  "worklet";
  return from + (to - from) * progress;
}

export { mix };
