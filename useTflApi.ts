// hooks/useTflApi.ts
import { useEffect, useReducer } from 'react';
import { useUserPreferencesStore } from './store/userPreferencesStore';

type ApiState = {
  data: { [key: string]: any };
  status: { [key: string]: 'idle' | 'loading' | 'refreshing' | 'success' | 'stale' | 'error' };
};

type ApiAction =
  | { type: 'FETCH_INIT'; lines: string[] }
  | { type: 'FETCH_SUCCESS'; data: { [key: string]: any }; lines: string[] }
  | { type: 'FETCH_ERROR'; lines: string[] }
  | { type: 'TICK_COUNTDOWN' };

const apiReducer = (state: ApiState, action: ApiAction): ApiState => {
  switch (action.type) {
    case 'FETCH_INIT':
      return {
        ...state,
        status: {
          ...state.status,
          ...action.lines.reduce((acc: any, line) => ({ ...acc, [line]: 'loading' }), {})
        }
      };
    case 'FETCH_SUCCESS':
      return {
        ...state,
        data: {
          ...state.data,
          ...action.data
        },
        status: {
          ...state.status,
          ...action.lines.reduce((acc: any, line) => ({ ...acc, [line]: 'success' }), {})
        }
      };
    case 'FETCH_ERROR':
      return {
        ...state,
        status: {
          ...state.status,
          ...action.lines.reduce((acc: any, line) => ({ ...acc, [line]: 'error' }), {})
        }
      };
    case 'TICK_COUNTDOWN':
      return {
        ...state,
        data: {
          ...state.data,
          ...Object.keys(state.data).reduce((acc: any, line) => {
            if (state.status[line] === 'success' && state.data[line]?.minutes_away !== undefined) {
              acc[line] = { ...state.data[line], minutes_away: state.data[line].minutes_away - 1 };
            }
            return acc;
          }, {})
        }
      };
    default:
      return state;
  }
};

const useTflApi = () => {
  const selectedLines = useUserPreferencesStore((state: any) => state.selectedLines);
  const [apiState, dispatch] = useReducer(apiReducer, { data: {}, status: {} });

  useEffect(() => {
    const fetchData = async () => {
      dispatch({ type: 'FETCH_INIT', lines: selectedLines });
      
      try {
        const responses = await Promise.allSettled(selectedLines.map((line: string) => fetch(`https://api.tfl.gov.uk/Line/${line}/Status`)));
        const results = await Promise.all(responses.map(async (response: any, index: number) => {
          if (response.status === 'fulfilled') {
            const data = await response.value.json();
            return { [selectedLines[index]]: data };
          } else {
            return { [selectedLines[index]]: null };
          }
        }));
        
        const dataMap = results.reduce((acc: any, result: any) => ({ ...acc, ...result }), {});
        dispatch({ type: 'FETCH_SUCCESS', data: dataMap, lines: selectedLines });
      } catch (error) {
        console.error('Failed to fetch data:', error);
        dispatch({ type: 'FETCH_ERROR', lines: selectedLines });
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60000);

    return () => clearInterval(interval);
  }, [selectedLines]);

  useEffect(() => {
    const tick = setInterval(() => {
      dispatch({ type: 'TICK_COUNTDOWN' });
    }, 30000);

    return () => clearInterval(tick);
  }, []);

  return { data: apiState.data, status: apiState.status };
};

export default useTflApi;

