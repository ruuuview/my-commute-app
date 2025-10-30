/**
 * Data fetching hook for Zustand store
 * 
 * Purpose: Fetch TfL line data from API and populate the store
 * Migration Step: 2/4 - LineDetailView integration
 */

import { useCallback } from 'react';
import Constants from 'expo-constants';
import { useLineDataStore } from '../store/lineDataStore';

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

/**
 * Hook for fetching and managing line data
 * Integrates with Zustand store
 */
export const useLineData = () => {
  const setLines = useLineDataStore(state => state.setLines);
  const setLoading = useLineDataStore(state => state.setLoading);
  const setError = useLineDataStore(state => state.setError);
  const lastFetchTime = useLineDataStore(state => state.lastFetchTime);

  /**
   * Fetch all lines from API and update store
   * @param forceRefresh - Skip cache and fetch fresh data
   */
  const fetchAllLines = useCallback(async (forceRefresh = false) => {
    const CACHE_DURATION = 30000; // 30 seconds
    const now = Date.now();
    
    // Skip if cache is still fresh (unless forcing refresh)
    if (!forceRefresh && lastFetchTime > 0 && (now - lastFetchTime) < CACHE_DURATION) {
      console.log('📦 STORE: Using cached data (cache still fresh)');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('🌐 STORE: Fetching all lines from API...');
      const response = await fetch(`${BACKEND_URL}/api/lines`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const lines = await response.json();
      console.log(`✅ STORE: Fetched ${lines.length} lines from API`);
      
      setLines(lines);
    } catch (error) {
      console.error('❌ STORE: Error fetching lines:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch line data');
      setLoading(false);
    }
  }, [lastFetchTime, setLines, setLoading, setError]);

  /**
   * Force refresh all lines (bypasses cache)
   */
  const refreshLines = useCallback(async () => {
    console.log('🔄 STORE: Force refreshing lines...');
    await fetchAllLines(true);
  }, [fetchAllLines]);

  return {
    fetchAllLines,
    refreshLines,
    lastFetchTime,
  };
};
