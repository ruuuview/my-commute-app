// hooks/useTflApi.ts
import { useEffect, useState } from 'react';
import { useUserPreferencesStore } from '../store/userPreferencesStore';

const useTflApi = () => {
  const selectedLines = useUserPreferencesStore((state) => state.selectedLines);
  const [data, setData] = useState<{ [key: string]: any }>({});
  const [status, setStatus] = useState<{ [key: string]: 'idle' | 'loading' | 'refreshing' | 'success' | 'stale' | 'error' }>({});

  useEffect(() => {
    const fetchData = async () => {
      setStatus((prev) => ({ ...prev, ...selectedLines.reduce((acc, line) => ({ ...acc, [line]: 'loading' }), {}) }));
      try {
        const responses = await Promise.allSettled(selectedLines.map(line => fetch(`https://api.tfl.gov.uk/Line/${line}/Status`)));
        const results = responses.map((response, index) => {
          if (response.status === 'fulfilled') {
            return { [selectedLines[index]]: response.value.json() };
          } else {
            return { [selectedLines[index]]: null };
          }
        });
        setData((prev) => ({ ...prev, ...results.reduce((acc, result) => ({ ...acc, ...result }), {}) }));
        setStatus((prev) => ({ ...prev, ...selectedLines.reduce((acc, line) => ({ ...acc, [line]: 'success' }), {}) }));
      } catch (error) {
        console.error('Failed to fetch data:', error);
        setStatus((prev) => ({ ...prev, ...selectedLines.reduce((acc, line) => ({ ...acc, [line]: 'error' }), {}) }));
      }
    };

    const interval = setInterval(fetchData, 60000);

    return () => clearInterval(interval);
  }, [selectedLines]);

  useEffect(() => {
    const tick = setInterval(() => {
      setData((prev) => ({
        ...Object.keys(prev).reduce((acc, line) => {
          if (status[line] === 'success') {
            acc[line] = { ...prev[line], minutes_away: prev[line].minutes_away - 1 };
          }
          return acc;
        }, {})
      }));
    }, 30000);

    return () => clearInterval(tick);
  }, [status]);

  return { data, status };
};

export default useTflApi;
