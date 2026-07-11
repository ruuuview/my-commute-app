/**
 * Zustand Store for TfL Line Status Data
 * 
 * Purpose: Central source of truth for all TfL line statuses
 * Migration Step: 1/4 - Store creation only (no component integration yet)
 */

import { create } from 'zustand';

// Type definitions
export interface LineStatus {
  id: string;
  name: string;
  color: string;
  status: string;
  status_severity: number;
  reason?: string;
}

interface LineDataState {
  // State
  lines: Record<string, LineStatus>;  // Map of lineId -> LineStatus
  isLoading: boolean;
  error: string | null;
  lastFetchTime: number;
  // Community report counts per lineId (used by useWorstStatus for signal upgrade)
  communityReports: Record<string, number>;

  // Actions
  setLines: (lines: LineStatus[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearStore: () => void;
  incrementCommunityReport: (lineId: string) => void;
  clearCommunityReports: (lineId: string) => void;
}

// Initial state
const initialState = {
  lines: {},
  isLoading: false,
  error: null,
  lastFetchTime: 0,
  communityReports: {} as Record<string, number>,
};

/**
 * Zustand store for line data
 * NOTE: This store is NOT yet used by any components
 * It will be integrated in Step 2 (LineDetailView migration)
 */
export const useLineDataStore = create<LineDataState>((set, get) => ({
  ...initialState,
  
  /**
   * Set line data from API response
   * Converts array to map for O(1) lookups
   */
  setLines: (lines: LineStatus[]) => {
    const linesMap: Record<string, LineStatus> = {};
    lines.forEach(line => {
      linesMap[line.id] = line;
    });
    
    set({
      lines: linesMap,
      lastFetchTime: Date.now(),
      error: null,
      isLoading: false,
    });
    
    if (__DEV__) {
      console.log('🏪 STORE: Updated with', lines.length, 'lines');
    }
  },
  
  /**
   * Set loading state
   */
  setLoading: (loading: boolean) => {
    set({ isLoading: loading });
  },
  
  /**
   * Set error state
   */
  setError: (error: string | null) => {
    set({ 
      error, 
      isLoading: false 
    });
  },
  
  /**
   * Clear all data (for debugging/testing)
   */
  clearStore: () => {
    set(initialState);
    if (__DEV__) {
      console.log('🧹 STORE: Cleared');
    }
  },

  /**
   * Increment the community report count for a line.
   * useWorstStatus upgrades TfL 'good' → 'minor' at ≥3 reports,
   * and 'minor' → 'severe' at ≥5 reports.
   */
  incrementCommunityReport: (lineId: string) => {
    set(state => ({
      communityReports: {
        ...state.communityReports,
        [lineId]: (state.communityReports[lineId] ?? 0) + 1,
      },
    }));
  },

  /**
   * Reset community reports for a specific line.
   * Call after the signal has been acted on or a time window expires.
   */
  clearCommunityReports: (lineId: string) => {
    set(state => {
      const updated = { ...state.communityReports };
      delete updated[lineId];
      return { communityReports: updated };
    });
  },
}));

// Convenience selectors (to be used in Step 2+)
export const useLines = () => useLineDataStore(state => state.lines);
export const useLine = (lineId: string) => useLineDataStore(state => state.lines[lineId]);
export const useLineLoading = () => useLineDataStore(state => state.isLoading);
export const useLineError = () => useLineDataStore(state => state.error);
