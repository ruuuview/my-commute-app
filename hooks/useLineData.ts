import { useCallback } from 'react';
import { useLineDataStore } from '../store/lineDataStore';
import { APP_CONFIG } from '../config/app.config';

export const useLineData = () => {
  const setLines = useLineDataStore(state => state.setLines);
  const setLoading = useLineDataStore(state => state.setLoading);
  const setError = useLineDataStore(state => state.setError);
  const lastFetchTime = useLineDataStore(state => state.lastFetchTime);

  const fetchAllLines = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh && lastFetchTime > 0 && (Date.now() - lastFetchTime) < 30000) return;

    try {
      // Only show loading spinner on first-ever fetch, not background refreshes
      const hasExistingData = Object.keys(useLineDataStore.getState().lines).length > 0;
      if (!hasExistingData) setLoading(true);
      const response = await fetch(`${APP_CONFIG.BACKEND_URL}/api/lines`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

      const lines = await response.json();

      // 🚨 PATCH: Fix Sorting Logic (Safe Numbers)
      lines.forEach((line: any) => {
        const s = String(line?.status ?? '').toLowerCase();
        
        if (s.includes('part closure') || s.includes('suspended') || s.includes('closure') || s.includes('closed')) {
           line.status_severity = 20; // RED (Highest Priority)
        } else if (s.includes('severe')) {
           line.status_severity = 9;  // RED (High Priority)
        } else if (s.includes('minor') || s.includes('part') || s.includes('reduced')) {
           line.status_severity = 5;  // AMBER (Medium Priority)
        } else {
           line.status_severity = 1;  // GREEN (Low Priority)
        }
      });

      setLines(lines);
    } catch (error: any) {
      console.error('❌ FETCH FAILED:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [lastFetchTime, setLines, setLoading, setError]);

  return { fetchAllLines, refreshLines: () => fetchAllLines(true) };
};
