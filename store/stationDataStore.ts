import { create } from 'zustand';

export interface ArrivalRow {
  minutesAway: number;
  destination: string;
  expectedArrival: string;
  branchName?: string;               // e.g., "via Bank"
  platform?: string;
}

export interface StationLineData {
  lineId: string;
  lineName: string;
  lineColor: string;
  firstTrain?: string;               // e.g., "05:22"
  lastTrain?: string;                // e.g., "00:32"
  isNightTube?: boolean;             // Active 24hr weekend service flag
  firstTrainDestination?: string;    // e.g., "To Epping"
  lastTrainDestination?: string;     // e.g., "To West Ruislip"
  arrivals: ArrivalRow[];
}

interface StationDataState {
  departures: Record<string, { lines: StationLineData[]; lastFetched: number }>;
  setDepartures: (stationId: string, lines: StationLineData[]) => void;
}

export const useStationDataStore = create<StationDataState>((set) => ({
  departures: {},
  setDepartures: (stationId, lines) => {
    set((state) => ({
      departures: {
        ...state.departures,
        [stationId]: {
          lines,
          lastFetched: Date.now(),
        },
      },
    }));
  },
}));
