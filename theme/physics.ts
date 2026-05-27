// theme/physics.ts — Master Global Physics Config
export const PREMIUM_SPRING_CONFIG = {
  damping: 15,       // High control, zero wild oscillation
  stiffness: 160,    // Snappy, urgent response
  mass: 0.5,         // Light, reactive physical weight
  overshootClamping: false, // Allows that premium subtle bounce edge
};

export const TACTILE_SCALES = {
  primary: 0.97,     // Continue / Primary CTA (Confident, heavy)
  secondary: 0.96,   // Item rows / Grid chips (Snappy feedback)
  tertiary: 0.95,    // Back Button / Dangerous actions (Highly tactile)
};
