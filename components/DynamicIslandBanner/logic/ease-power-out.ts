// Vendored from rit3zh/expo-dynamic-notifications @ 5de059a (MIT License). Imports rewritten from @/ alias to relative paths.
function easeOutPower(progress: number, power: number): number {
  "worklet";
  const normalized = Math.min(Math.max(progress, 0), 1);
  return 1 - Math.pow(1 - normalized, power);
}

export { easeOutPower };
