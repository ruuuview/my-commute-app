import { useCallback } from 'react';

export function useTapSound() {
  const playSelect = useCallback(async () => {
    // No-op
  }, []);

  const playDeselect = useCallback(async () => {
    // No-op
  }, []);

  const playConfirm = useCallback(async () => {
    // No-op
  }, []);

  return { playSelect, playDeselect, playConfirm, playTap: playSelect };
}
