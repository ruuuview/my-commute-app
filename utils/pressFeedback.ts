// utils/pressFeedback.ts
/**
 * Global press feedback cancellation bus.
 *
 * When scroll containers (NestableScrollContainer, NestableDraggableFlatList)
 * begin dragging, they broadcast to all registered cards to cancel any in-flight
 * press animations immediately (0ms delay, no remainingHold wait, no bounce).
 */

type CancelFn = () => void;

const listeners = new Set<CancelFn>();

export const pressFeedback = {
  register(cancel: CancelFn): () => void {
    listeners.add(cancel);
    return () => {
      listeners.delete(cancel);
    };
  },

  cancelAll(): void {
    listeners.forEach((cancel) => {
      try {
        cancel();
      } catch (err) {
        console.warn('[pressFeedback] Error running cancel callback:', err);
      }
    });
  },
};
