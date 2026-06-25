import { StationLineData } from '../store/stationDataStore';
import { LINE_COLORS } from '../constants/lineColors';
import { normaliseLineId } from './normaliseLineId';

// Explicitly type the inner train structure expected by the UI components
export interface CleanTrainData {
  id: string;
  expectedArrival: string;
  timeToStation: number;
  currentLocation: string;
  towards?: string;
}

// Represent the raw TfL arrival row payload shape
export interface TflArrivalRow {
  id: string;
  lineId: string;
  lineName: string;
  destinationName: string;
  platformName: string;
  expectedArrival: string;
  timeToStation: number;
  currentLocation: string;
  towards?: string;
  firstTrain?: string;
  lastTrain?: string;
}

// Extend your existing StationLineData type structure to ensure complete compliance
export interface CappedStationLineData extends Omit<StationLineData, 'trains' | 'arrivals' | 'lineColor'> {
  routeColor: string;
  trains: CleanTrainData[];
}

export function groupStationDepartures(arrivals: TflArrivalRow[]): CappedStationLineData[] {
  if (!arrivals || arrivals.length === 0) return [];

  // 1. Deduplicate and sort by soonest arrival (timeToStation ascending)
  const sortedArrivals = [...arrivals]
    .filter((v, i, a) => a.findIndex(t => t.id === v.id) === i)
    .sort((a, b) => a.timeToStation - b.timeToStation);

  // 2. Group by Line and Destination
  const groups: { [key: string]: TflArrivalRow[] } = {};
  
  sortedArrivals.forEach(arrival => {
    // Create a unique key combining line and platform/destination to group matching routes
    const groupKey = `${arrival.lineId}-${arrival.destinationName}`;
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(arrival);
  });

  // 3. Map into clean, capped display blocks for the premium UI
  const formattedLines: CappedStationLineData[] = Object.keys(groups).map(key => {
    const rawTrains = groups[key];
    const firstTrain = rawTrains[0];
    const normalisedLine = normaliseLineId(firstTrain.lineId);

    return {
      lineId: firstTrain.lineId,
      lineName: firstTrain.lineName,
      destinationName: firstTrain.destinationName,
      platformName: firstTrain.platformName,
      routeColor: LINE_COLORS[normalisedLine.cleanLineId] || '#FFFFFF',
      
      // 🔥 THE UI CAP: Only keep the next 3 closest trains so the modal stays clean and compact
      trains: rawTrains.slice(0, 3).map(t => ({
        id: t.id,
        expectedArrival: t.expectedArrival,
        timeToStation: t.timeToStation,
        currentLocation: t.currentLocation,
        towards: t.towards
      })),
      
      // Only include scheduling parameters if they genuinely exist in the TfL payload
      firstTrain: firstTrain.firstTrain || undefined,
      lastTrain: firstTrain.lastTrain || undefined,
    };
  });

  return formattedLines;
}
