// Vendored from rit3zh/expo-dynamic-notifications @ 5de059a (MIT License). Imports rewritten from @/ alias to relative paths.
import { ENTRY_DURATION_MS, EXIT_ANTICIPATION_VELOCITY, EXIT_DURATION_MS } from '../constants/notification.consts';
import type { WithSpringConfig } from "react-native-reanimated";

const DROP_SPRING: WithSpringConfig = {
  duration: ENTRY_DURATION_MS,
  dampingRatio: 0.82,
};

const EXPAND_SPRING: WithSpringConfig = {
  duration: 300,
  dampingRatio: 0.8,
};

const REVEAL_SPRING: WithSpringConfig = {
  duration: 220,
  dampingRatio: 1,
};

const TINT_SPRING: WithSpringConfig = {
  duration: 350,
  dampingRatio: 1,
};

const COLLAPSE_SPRING: WithSpringConfig = {
  duration: 300,
  dampingRatio: 0.92,
  velocity: EXIT_ANTICIPATION_VELOCITY,
};

const RETURN_SPRING: WithSpringConfig = {
  duration: 320,
  dampingRatio: 0.9,
};

const FADE_SPRING: WithSpringConfig = {
  duration: EXIT_DURATION_MS,
  dampingRatio: 1,
};

const DRAG_SPRING: WithSpringConfig = {
  duration: 560,
  dampingRatio: 0.7,
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
