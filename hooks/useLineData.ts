import { useCallback } from 'react';
import { useLineDataStore } from '../store/lineDataStore';
import { APP_CONFIG } from '../config/app.config';

export const useLineData = () => {
  const setLines = useLineDataStore(state => state.setLines);
  const setLoading = useLineDataStore(state => state.setLoading);
  const setError = useLineDataStore(state => state.setError);
  const lastFetchTime = useLineDataStore(state => state.lastFetchTime);

  const fetchAllLines = useCallback(async (forceRefresh = false) => {
    // Cache check (30 seconds)
    if (!forceRefresh && lastFetchTime > 0 && (Date.now() - lastFetchTime) < 30000) return;

    try {
      setLoading(true);
      console.log(`🌐 FETCHING: ${APP_CONFIG.BACKEND_URL}/api/lines`);
      
      const response = await fetch(`${APP_CONFIG.BACKEND_URL}/api/lines`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

      const lines = await response.json();

      // 🚨 PATCH: Fix Severity Logic
      // If the API sends status 0 (Green) for bad events, we override it here.
      lines.forEach((line: any) => {
        const s = (line.status || '').toLowerCase();
        
        if (s.includes('part closure') || s.includes('suspended') || s.includes('closure')) {
           // Force RED (Severity 7+)
           line.status_severity = 9; 
        } else if (s.includes('severe')) {
           // Force High AMBER (Severity 6)
           line.status_severity = 6;
        } else if (s.includes('minor') || s.includes('part')) {
           // Force AMBER (Severity 3)
           line.status_severity = 3;
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
