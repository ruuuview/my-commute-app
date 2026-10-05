// Vendored from rit3zh/expo-dynamic-notifications @ 5de059a (MIT License). Imports rewritten from @/ alias to relative paths.
import { ENTRY_DURATION_MS, EXIT_DURATION_MS } from '../constants/notification.consts';
import type { WithSpringConfig } from "react-native-reanimated";

const DROP_SPRING: WithSpringConfig = {
  duration: ENTRY_DURATION_MS,
  dampingRatio: 0.84,
};

const EXPAND_SPRING: WithSpringConfig = {
  duration: 850,
  dampingRatio: 0.84,
};

const REVEAL_SPRING: WithSpringConfig = {
  duration: 480,
  dampingRatio: 0.95,
};

const TINT_SPRING: WithSpringConfig = {
  duration: 650,
  dampingRatio: 0.90,
};

const COLLAPSE_SPRING: WithSpringConfig = {
  duration: 550,
  dampingRatio: 0.85,
};

const RETURN_SPRING: WithSpringConfig = {
  duration: EXIT_DURATION_MS,
  dampingRatio: 0.82,
};

const FADE_SPRING: WithSpringConfig = {
  duration: 220,
  dampingRatio: 1,
};

const DRAG_SPRING: WithSpringConfig = {
  duration: 520,
  dampingRatio: 0.75,
};

export {
  COLLAPSE_SPRING,
  DRAG_SPRING,
  DROP_SPRING,
  EXPAND_SPRING,
  FADE_SPRING,
  RETURN_SPRING,
  REVEAL_SPRING,
  TINT_SPRING,
};
