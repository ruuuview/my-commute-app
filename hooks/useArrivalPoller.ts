import { useState, useEffect } from 'react';

export interface Arrival {
  id: string;
  lineId: string;
  lineName: string;
  destinationName: string;
  timeToStation: number; // in seconds
  expectedArrival: string;
}

export function useArrivalPoller(naptanId: string | null) {
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [error, setError] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!naptanId) {
      setArrivals([]);
      setError(false);
      return;
    }

    const fetchArrivals = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://api.tfl.gov.uk/StopPoint/${naptanId}/Arrivals`
        );
        if (!res.ok) throw new Error('TfL API error');
        const data = await res.json();
        
        // Map raw TfL departures to our clean Arrival model
        const mapped: Arrival[] = data.map((item: any) => ({
          id: String(item.id || ''),
          lineId: String(item.lineId || '').toLowerCase(),
          lineName: String(item.lineName || ''),
          destinationName: String(item.destinationName || '').replace(' Underground Station', '').replace(' DLR Station', ''),
          timeToStation: Number(item.timeToStation || 0),
          expectedArrival: String(item.expectedArrival || ''),
        }));

        setArrivals(mapped.sort((a, b) => a.timeToStation - b.timeToStation));
        setError(false);
      } catch (err) {
        console.log('Error fetching arrivals for', naptanId, err);
        setError(true); // Silent failure, fallback in UI
      } finally {
        setLoading(false);
      }
    };

    fetchArrivals();
    const interval = setInterval(fetchArrivals, 30000);
    return () => clearInterval(interval);
  }, [naptanId]);

  return { arrivals, error, loading };
}
