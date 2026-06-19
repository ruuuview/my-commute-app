// app/(lineStack)/lineDetail.tsx — Line Detail Screen (v2)
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, {
  SlideInDown,
  useDerivedValue,
  useAnimatedStyle,
  withTiming,
  LinearTransition,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import * as Location from 'expo-location';

import { useLine, useLines, useLineLoading, LineStatus } from '../../store/lineDataStore';
import { useLineData } from '../../hooks/useLineData';
import { useUserPreferencesStore } from '../../store/userPreferencesStore';
import { playSound } from '../../utils/sound';
import { usePressAnimation } from '../../hooks/usePressAnimation';
import { APP_CONFIG } from '../../config/app.config';
import { LinearGradient } from 'expo-linear-gradient';
import INTERCHANGE_COORDINATES_DATA from '../../data/interchangeCoordinates.json';
import { DashboardGradient } from '../../components/DashboardGradient';
import type { Severity } from '../../components/MyCommuteDashboard';

const INTERCHANGE_COORDINATES = INTERCHANGE_COORDINATES_DATA as Record<
  string,
  { id: string; name: string; lat: number; lon: number }
>;

const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371000; // Radius of the Earth in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const severityFromNumber = (n: number | undefined): Severity => {
  if (n === undefined) return 'unknown';
  if (n === 1) return 'good';
  if (n >= 2 && n <= 8) return 'minor';
  if (n === 20) return 'suspended';
  if (n >= 9) return 'severe';
  return 'unknown';
};

const BRAND_VOICE_STRINGS: Record<string, string> = {
  elizabeth: "Elizabeth's behaving itself today. No drama on the track.",
  central: "Central is running hot but running clean. Smooth sailing.",
  northern: "The Northern line is behaving itself. No gaps in the deep.",
  jubilee: "Jubilee is gliding smoothly today. Silver trains, gold standards.",
  victoria: "Victoria is doing what it does best: fast, frequent, and zero drama.",
  piccadilly: "Piccadilly is on its best behavior. All clear to Heathrow and beyond.",
  district: "District is in order today. All branches green.",
  circle: "Going in circles, but in a good way. The Circle line is all clear.",
  bakerloo: "The brown line is holding it down. Bakerloo is running smoothly.",
  metropolitan: "Metropolitan is flying down the fast tracks. Good service all day.",
  'hammersmith-city': "Pink and pretty quiet. Hammersmith & City is running clear.",
  overground: "Overground is looking solid. Your local links are green.",
  dlr: "DLR is running itself perfectly. Sit at the front and enjoy the ride.",
  'waterloo-city': "Waterloo & City is running. The drain is clean today.",
};

const getBrandVoiceString = (id: string): string => {
  return BRAND_VOICE_STRINGS[id] || `${id.charAt(0).toUpperCase() + id.slice(1)} is behaving itself today. No drama on the tracks.`;
};

interface InterchangeStation {
  id: string;
  name: string;
}

interface SharedTrackInfo {
  sharedTrack: string;
}

type ConnectionData = InterchangeStation[] | SharedTrackInfo;

const COMPLETE_INTERCHANGE_DB: { [key: string]: ConnectionData } = {
  'bakerloo-central': [],
  'bakerloo-circle': [{ id: '940GZZLUBST', name: 'Baker Street' }, { id: '940GZZLUEMB', name: 'Embankment' }],
  'bakerloo-district': [{ id: '940GZZLUEMB', name: 'Embankment' }],
  'bakerloo-dlr': [],
  'bakerloo-elizabeth': [{ id: '940GZZLUPAC', name: 'Paddington' }],
  'bakerloo-hammersmith-city': [{ id: '940GZZLUBST', name: 'Baker Street' }],
  'bakerloo-jubilee': [{ id: '940GZZLUBST', name: 'Baker Street' }, { id: '940GZZLUWLO', name: 'Waterloo' }],
  'bakerloo-liberty': [],
  'bakerloo-lioness': [],
  'bakerloo-metropolitan': [{ id: '940GZZLUBST', name: 'Baker Street' }],
  'bakerloo-mildmay': [],
  'bakerloo-northern': [{ id: '940GZZLUEAC', name: 'Elephant & Castle' }],
  'bakerloo-piccadilly': [],
  'bakerloo-suffragette': [],
  'bakerloo-victoria': [{ id: '940GZZLUOXC', name: 'Oxford Circus' }],
  'bakerloo-waterloo-city': [{ id: '940GZZLUWLO', name: 'Waterloo' }],
  'bakerloo-weaver': [],
  'bakerloo-windrush': [],
  'central-circle': [{ id: '940GZZLULVT', name: 'Liverpool Street' }, { id: '940GZZLUNHG', name: 'Notting Hill Gate' }],
  'central-district': [{ id: '940GZZLUNHG', name: 'Notting Hill Gate' }],
  'central-dlr': [{ id: '940GZZLUBNK', name: 'Bank' }, { id: '940GZZLUSTD', name: 'Stratford' }],
  'central-elizabeth': [{ id: '940GZZLUBND', name: 'Bond Street' }, { id: '940GZZLULVT', name: 'Liverpool Street' }, { id: '940GZZLUTCR', name: 'Tottenham Court Road' }],
  'central-hammersmith-city': [{ id: '940GZZLULVT', name: 'Liverpool Street' }],
  'central-jubilee': [{ id: '940GZZLUBND', name: 'Bond Street' }, { id: '940GZZLUSTD', name: 'Stratford' }],
  'central-liberty': [{ id: '940GZZLUSTD', name: 'Stratford' }],
  'central-lioness': [],
  'central-metropolitan': [{ id: '940GZZLULVT', name: 'Liverpool Street' }],
  'central-mildmay': [],
  'central-northern': [{ id: '940GZZLUBNK', name: 'Bank' }, { id: '940GZZLUTCR', name: 'Tottenham Court Road' }],
  'central-piccadilly': [{ id: '940GZZLUHBN', name: 'Holborn' }],
  'central-suffragette': [{ id: '940GZZLUSTD', name: 'Stratford' }],
  'central-victoria': [],
  'central-waterloo-city': [{ id: '940GZZLUBNK', name: 'Bank' }],
  'central-weaver': [{ id: '940GZZLULVT', name: 'Liverpool Street' }],
  'central-windrush': [{ id: '940GZZLUSTD', name: 'Stratford' }],
  'circle-district': { sharedTrack: 'These lines share the majority of their route around central London. You can switch at almost any shared station.' },
  'circle-dlr': [{ id: '940GZZLUTMP', name: 'Tower Hill' }],
  'circle-elizabeth': [{ id: '940GZZLULVT', name: 'Liverpool Street' }, { id: '940GZZLUPAH', name: 'Paddington' }],
  'circle-hammersmith-city': { sharedTrack: 'These lines share multiple stations between Paddington and Liverpool Street. You can switch at most stations on this section.' },
  'circle-jubilee': [{ id: '940GZZLUWSM', name: 'Westminster' }],
  'circle-liberty': [],
  'circle-lioness': [],
  'circle-metropolitan': { sharedTrack: 'These lines share multiple stations including Baker Street, King\'s Cross St Pancras, and the eastern section. You can switch at most shared stations.' },
  'circle-mildmay': [],
  'circle-northern': [],
  'circle-piccadilly': [],
  'circle-suffragette': [],
  'circle-victoria': [{ id: '940GZZLUVIC', name: 'Victoria' }],
  'circle-waterloo-city': [],
  'circle-weaver': [],
  'circle-windrush': [],
  'district-dlr': [{ id: '940GZZLUTMP', name: 'Tower Hill' }],
  'district-elizabeth': [],
  'district-hammersmith-city': { sharedTrack: 'These lines share several stations in West London. You can switch at multiple shared stations.' },
  'district-jubilee': [{ id: '940GZZLUWSM', name: 'Westminster' }],
  'district-liberty': [],
  'district-lioness': [],
  'district-metropolitan': [],
  'district-mildmay': [],
  'district-northern': [{ id: '940GZZLUEMB', name: 'Embankment' }],
  'district-piccadilly': { sharedTrack: 'These lines run parallel and share multiple stations between South Kensington and Hammersmith. You can switch at most stations on this section.' },
  'district-suffragette': [],
  'district-victoria': [{ id: '940GZZLUVIC', name: 'Victoria' }],
  'district-waterloo-city': [],
  'district-weaver': [],
  'district-windrush': [],
  'dlr-elizabeth': [{ id: '940GZZLUCYF', name: 'Canary Wharf' }],
  'dlr-hammersmith-city': [],
  'dlr-jubilee': [{ id: '940GZZLUCYF', name: 'Canary Wharf' }, { id: '940GZZLUSTD', name: 'Stratford' }],
  'dlr-liberty': [{ id: '940GZZLUSTD', name: 'Stratford' }],
  'dlr-lioness': [{ id: '940GZZLUCYF', name: 'Canary Wharf' }],
  'dlr-metropolitan': [],
  'dlr-mildmay': [],
  'dlr-northern': [{ id: '940GZZLUBNK', name: 'Bank' }],
  'dlr-piccadilly': [],
  'dlr-suffragette': [{ id: '940GZZLUSTD', name: 'Stratford' }],
  'dlr-victoria': [],
  'dlr-waterloo-city': [{ id: '940GZZLUBNK', name: 'Bank' }],
  'dlr-weaver': [],
  'dlr-windrush': [{ id: '940GZZLUSTD', name: 'Stratford' }],
  'elizabeth-hammersmith-city': [{ id: '940GZZLUPAH', name: 'Paddington' }, { id: '940GZZLULVT', name: 'Liverpool Street' }],
  'elizabeth-jubilee': [{ id: '940GZZLUBND', name: 'Bond Street' }, { id: '940GZZLUCYF', name: 'Canary Wharf' }],
  'elizabeth-liberty': [{ id: '940GZZLUSTD', name: 'Stratford' }],
  'elizabeth-lioness': [],
  'elizabeth-metropolitan': [{ id: '940GZZLULVT', name: 'Liverpool Street' }],
  'elizabeth-mildmay': [],
  'elizabeth-northern': [],
  'elizabeth-piccadilly': [],
  'elizabeth-suffragette': [{ id: '940GZZLUSTD', name: 'Stratford' }],
  'elizabeth-victoria': [{ id: '940GZZLUVIC', name: 'Victoria' }],
  'elizabeth-waterloo-city': [],
  'elizabeth-weaver': [{ id: '940GZZLULVT', name: 'Liverpool Street' }],
  'elizabeth-windrush': [{ id: '940GZZLUSTD', name: 'Stratford' }],
  'hammersmith-city-jubilee': [],
  'hammersmith-city-liberty': [],
  'hammersmith-city-lioness': [],
  'hammersmith-city-metropolitan': { sharedTrack: 'These lines share multiple stations including Baker Street, King\'s Cross St Pancras, and sections of the route. You can switch at most shared stations.' },
  'hammersmith-city-mildmay': [],
  'hammersmith-city-northern': [{ id: '940GZZLUKSX', name: 'King\'s Cross St Pancras' }],
  'hammersmith-city-piccadilly': [{ id: '940GZZLUKSX', name: 'King\'s Cross St Pancras' }],
  'hammersmith-city-suffragette': [],
  'hammersmith-city-victoria': [{ id: '940GZZLUKSX', name: 'King\'s Cross St Pancras' }],
  'hammersmith-city-waterloo-city': [],
  'hammersmith-city-weaver': [],
  'hammersmith-city-windrush': [],
  'jubilee-liberty': [{ id: '940GZZLUSTD', name: 'Stratford' }],
  'jubilee-lioness': [{ id: '940GZZLUCWR', name: 'Canada Water' }],
  'jubilee-metropolitan': [{ id: '940GZZLUBST', name: 'Baker Street' }],
  'jubilee-mildmay': [{ id: '940GZZLUHSN', name: 'Highbury & Islington' }],
  'jubilee-northern': [{ id: '940GZZLULNB', name: 'London Bridge' }, { id: '940GZZLUWLO', name: 'Waterloo' }, { id: '940GZZLUGPK', name: 'Green Park' }],
  'jubilee-piccadilly': [{ id: '940GZZLUGPK', name: 'Green Park' }],
  'jubilee-suffragette': [{ id: '940GZZLUSTD', name: 'Stratford' }],
  'jubilee-victoria': [{ id: '940GZZLUGPK', name: 'Green Park' }],
  'jubilee-waterloo-city': [{ id: '940GZZLUWLO', name: 'Waterloo' }],
  'jubilee-weaver': [],
  'jubilee-windrush': [{ id: '940GZZLUSTD', name: 'Stratford' }],
  'liberty-lioness': [{ id: '910GCMDNRD', name: 'Camden Road' }],
  'liberty-metropolitan': [],
  'liberty-mildmay': [{ id: '940GZZLUHSN', name: 'Highbury & Islington' }],
  'liberty-northern': [{ id: '940GZZLUHSN', name: 'Highbury & Islington' }],
  'liberty-piccadilly': [],
  'liberty-suffragette': [{ id: '940GZZLUSTD', name: 'Stratford' }],
  'liberty-victoria': [{ id: '940GZZLUHSN', name: 'Highbury & Islington' }],
  'liberty-waterloo-city': [],
  'liberty-weaver': [],
  'liberty-windrush': [{ id: '940GZZLUSTD', name: 'Stratford' }],
  'lioness-metropolitan': [],
  'lioness-mildmay': [{ id: '940GZZLUHSN', name: 'Highbury & Islington' }],
  'lioness-northern': [{ id: '940GZZLUHSN', name: 'Highbury & Islington' }],
  'lioness-piccadilly': [],
  'lioness-suffragette': [],
  'lioness-victoria': [{ id: '940GZZLUHSN', name: 'Highbury & Islington' }],
  'lioness-waterloo-city': [],
  'lioness-weaver': [],
  'lioness-windrush': [{ id: '940GZZLUHSN', name: 'Highbury & Islington' }],
  'metropolitan-mildmay': [],
  'metropolitan-northern': [{ id: '940GZZLUBST', name: 'Baker Street' }, { id: '940GZZLUKSX', name: 'King\'s Cross St Pancras' }],
  'metropolitan-piccadilly': [{ id: '940GZZLUKSX', name: 'King\'s Cross St Pancras' }],
  'metropolitan-suffragette': [],
  'metropolitan-victoria': [{ id: '940GZZLUKSX', name: 'King\'s Cross St Pancras' }],
  'metropolitan-waterloo-city': [],
  'metropolitan-weaver': [],
  'metropolitan-windrush': [],
  'mildmay-northern': [{ id: '940GZZLUHSN', name: 'Highbury & Islington' }],
  'mildmay-piccadilly': [],
  'mildmay-suffragette': [],
  'mildmay-victoria': [{ id: '940GZZLUHSN', name: 'Highbury & Islington' }],
  'mildmay-waterloo-city': [],
  'mildmay-weaver': [],
  'mildmay-windrush': [{ id: '940GZZLUHSN', name: 'Highbury & Islington' }],
  'northern-piccadilly': [{ id: '940GZZLUKSX', name: 'King\'s Cross St Pancras' }],
  'northern-suffragette': [],
  'northern-victoria': [{ id: '940GZZLUKSX', name: 'King\'s Cross St Pancras' }, { id: '940GZZLUEUS', name: 'Euston' }, { id: '940GZZLUOXC', name: 'Oxford Circus' }, { id: '940GZZLUGPK', name: 'Green Park' }, { id: '940GZZLUVIC', name: 'Victoria' }, { id: '940GZZLUSKW', name: 'Stockwell' }],
  'northern-waterloo-city': [{ id: '940GZZLUWLO', name: 'Waterloo' }, { id: '940GZZLUBNK', name: 'Bank' }],
  'northern-weaver': [],
  'northern-windrush': [{ id: '940GZZLUHSN', name: 'Highbury & Islington' }],
  'piccadilly-suffragette': [],
  'piccadilly-victoria': [{ id: '940GZZLUKSX', name: 'King\'s Cross St Pancras' }, { id: '940GZZLUGPK', name: 'Green Park' }],
  'piccadilly-waterloo-city': [],
  'piccadilly-weaver': [],
  'piccadilly-windrush': [],
  'suffragette-victoria': [],
  'suffragette-waterloo-city': [],
  'suffragette-weaver': [{ id: '940GZZLUSTD', name: 'Stratford' }],
  'suffragette-windrush': [{ id: '940GZZLUSTD', name: 'Stratford' }],
  'victoria-waterloo-city': [],
  'victoria-weaver': [],
  'victoria-windrush': [{ id: '940GZZLUHSN', name: 'Highbury & Islington' }],
  'waterloo-city-weaver': [],
  'waterloo-city-windrush': [],
  'weaver-windrush': [],
};

const getConnectionData = (line1Id: string, line2Id: string): ConnectionData | null => {
  const key = [line1Id, line2Id].sort().join('-');
  const data = COMPLETE_INTERCHANGE_DB[key];
  if (Array.isArray(data) && data.length === 0) return null;
  return data || null;
};

const getInterchangeStations = (line1Id: string, line2Id: string): InterchangeStation[] => {
  const connection = getConnectionData(line1Id, line2Id);
  if (!connection) return [];
  if (Array.isArray(connection)) return connection;

  // Shared track fallbacks with real key stations
  const key = [line1Id, line2Id].sort().join('-');
  if (key === 'circle-district') {
    return [
      { id: '940GZZLUVIC', name: 'Victoria' },
      { id: '940GZZLUEMB', name: 'Embankment' },
      { id: '940GZZLUWSM', name: 'Westminster' },
      { id: '940GZZLUTMP', name: 'Tower Hill' },
      { id: '940GZZLUNHG', name: 'Notting Hill Gate' }
    ];
  }
  if (key === 'circle-hammersmith-city') {
    return [
      { id: '940GZZLUPAC', name: 'Paddington' },
      { id: '940GZZLUBST', name: 'Baker Street' },
      { id: '940GZZLUKSX', name: "King's Cross St Pancras" },
      { id: '940GZZLULVT', name: 'Liverpool Street' }
    ];
  }
  if (key === 'circle-metropolitan') {
    return [
      { id: '940GZZLUBST', name: 'Baker Street' },
      { id: '940GZZLUKSX', name: "King's Cross St Pancras" },
      { id: '940GZZLULVT', name: 'Liverpool Street' }
    ];
  }
  if (key === 'district-hammersmith-city') {
    return [
      { id: '940GZZLUBGR', name: 'Barking' },
      { id: '940GZZLUWHP', name: 'Whitechapel' },
      { id: '940GZZLUMld', name: 'Mile End' }
    ];
  }
  if (key === 'district-piccadilly') {
    return [
      { id: '940GZZLUHAM', name: 'Hammersmith' },
      { id: '940GZZLUECT', name: "Earl's Court" },
      { id: '940GZZLUSFk', name: 'South Kensington' }
    ];
  }
  if (key === 'hammersmith-city-metropolitan') {
    return [
      { id: '940GZZLUBST', name: 'Baker Street' },
      { id: '940GZZLUKSX', name: "King's Cross St Pancras" },
      { id: '940GZZLULVT', name: 'Liverpool Street' }
    ];
  }
  return [];
};

const getStatusPillColors = (severity: number) => {
  if (severity === 1) {
    return {
      bg: 'rgba(16, 185, 129, 0.18)',
      border: 'rgba(16, 185, 129, 0.3)',
      text: '#10B981',
    };
  } else if (severity < 9) {
    return {
      bg: 'rgba(255, 176, 32, 0.18)',
      border: 'rgba(255, 176, 32, 0.3)',
      text: '#FFB020',
    };
  } else {
    return {
      bg: 'rgba(209, 67, 67, 0.18)',
      border: 'rgba(209, 67, 67, 0.3)',
      text: '#D14343',
    };
  }
};

export default function LineDetailScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const lineId = params.lineId as string;

  const storeLineData = useLine(lineId);
  const allLinesMap = useLines();
  const loading = useLineLoading();
  const { fetchAllLines } = useLineData();

  // Fallback: if in-memory store is empty (cold start / API down),
  // use the MMKV-persisted lastKnownData from the dashboard
  const lastKnownData = useUserPreferencesStore((s) => s.lastKnownData);
  const lineData = storeLineData ?? lastKnownData?.find((l: LineStatus) => l.id === lineId) ?? null;

  const pinnedStations = useUserPreferencesStore((s) => s.pinnedStations);
  const selectedLines = useUserPreferencesStore((s) => s.selectedLines);

  const [copied, setCopied] = useState(false);
  const [stationDepartures, setStationDepartures] = useState<Record<string, any[]>>({});
  const [loadingDepartures, setLoadingDepartures] = useState(false);
  const [stationCoordsMap, setStationCoordsMap] = useState<Record<string, { lat: number; lon: number }>>({});
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);

  // Filter pinned stations to find those serving the current line
  const lineStations = useMemo(() => {
    return pinnedStations.filter((s) => s.lines.includes(lineId));
  }, [pinnedStations, lineId]);

  const locationGranted = useUserPreferencesStore((s) => s.locationGranted);

  // Fetch live user location on mount if permitted
  useEffect(() => {
    const fetchLocation = async () => {
      if (!locationGranted) return;
      try {
        const lastKnown = await Location.getLastKnownPositionAsync({});
        if (lastKnown) {
          setUserLocation({ lat: lastKnown.coords.latitude, lon: lastKnown.coords.longitude });
        } else {
          const current = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setUserLocation({ lat: current.coords.latitude, lon: current.coords.longitude });
        }
      } catch (e) {
        console.log('Error fetching location:', e);
      }
    };
    fetchLocation();
  }, [locationGranted]);

  // Fetch all lines on mount if missing
  useEffect(() => {
    const loadData = async () => {
      if (!lineData || Object.keys(allLinesMap).length === 0) {
        await fetchAllLines();
      }
    };
    loadData();
  }, [lineId, allLinesMap, fetchAllLines, lineData]);

  // Fetch departures for nominal view & coordinates mapping
  const fetchDepartures = useCallback(async () => {
    if (lineStations.length === 0) return;
    try {
      setLoadingDepartures(true);
      const ids = lineStations.map(s => s.id).join(',');
      const res = await fetch(`${APP_CONFIG.BACKEND_URL}/api/stations/batch?ids=${ids}`);
      if (res.ok) {
        const data = await res.json();
        const departuresMap: Record<string, any[]> = {};
        const coordsMap: Record<string, { lat: number; lon: number }> = {};
        Object.keys(data.stations || {}).forEach(sid => {
          const sData = data.stations[sid];
          if (sData) {
            if (Array.isArray(sData.departures)) {
              // Filter departures to only match this line
              departuresMap[sid] = sData.departures.filter(
                (d: any) => d.line_id === lineId
              );
            }
            if (sData.lat !== undefined && sData.lon !== undefined && sData.lat !== null && sData.lon !== null) {
              coordsMap[sid] = { lat: Number(sData.lat), lon: Number(sData.lon) };
            }
          }
        });
        setStationDepartures(departuresMap);
        setStationCoordsMap(coordsMap);
      }
    } catch (e) {
      console.log('Error fetching line station departures:', e);
    } finally {
      setLoadingDepartures(false);
    }
  }, [lineStations, lineId]);

  const statusSeverity = lineData?.status_severity;

  useEffect(() => {
    if (statusSeverity === 1) {
      fetchDepartures();
      const interval = setInterval(fetchDepartures, 30000);
      return () => clearInterval(interval);
    }
  }, [statusSeverity, fetchDepartures]);

  // Dynamic Trust Badge Logic
  const dataFreshness = useMemo(() => {
    if (!lineData || !(lineData as any).updated_at) {
      return { badgeColor: '#6B7280', label: 'Feed delayed', timeText: 'No timestamp' };
    }
    const updatedTime = new Date((lineData as any).updated_at).getTime();
    const ageMins = Math.max(0, Math.floor((Date.now() - updatedTime) / 60000));

    if (ageMins < 5) {
      return {
        badgeColor: '#D14343',
        label: 'LIVE',
        timeText: ageMins === 0 ? 'just now' : `${ageMins}m ago`,
      };
    } else if (ageMins <= 10) {
      return {
        badgeColor: '#FFB020',
        label: 'Updating...',
        timeText: `${ageMins}m ago`,
      };
    } else {
      return {
        badgeColor: '#6B7280',
        label: 'Feed delayed',
        timeText: `${ageMins}m ago`,
      };
    }
  }, [lineData]);

  // Get anchor coordinates (User Location OR serving pinned station coordinates)
  const anchorCoords = useMemo(() => {
    if (userLocation) return userLocation;
    const pinnedWithCoords = lineStations.find(s => stationCoordsMap[s.id]);
    if (pinnedWithCoords) {
      return stationCoordsMap[pinnedWithCoords.id];
    }
    return null;
  }, [userLocation, lineStations, stationCoordsMap]);

  // Filter and sort alternatives for state A
  const alternatives = useMemo(() => {
    if (!lineData || lineData.status_severity <= 1) return [];

    const activeAlts: any[] = [];
    Object.keys(allLinesMap).forEach((altLineId) => {
      if (altLineId === lineId) return;
      const connection = getConnectionData(lineId, altLineId);
      if (connection) {
        const altLine = allLinesMap[altLineId];
        if (altLine && altLine.status_severity < 9) activeAlts.push(altLine);
      }
    });

    // Sort by: Minimum Friction (Severity ASC -> Distance ASC -> Saved Status DESC)
    return activeAlts.sort((a, b) => {
      // 1. Severity ASC
      if (a.status_severity !== b.status_severity) {
        return a.status_severity - b.status_severity;
      }
      // 2. Distance ASC
      let distA = Infinity;
      let distB = Infinity;
      if (anchorCoords) {
        const connA = getConnectionData(lineId, a.id);
        const connB = getConnectionData(lineId, b.id);
        if (connA && Array.isArray(connA)) {
          connA.forEach(s => {
            const coords = INTERCHANGE_COORDINATES[s.id];
            if (coords) {
              const dist = haversineDistance(anchorCoords.lat, anchorCoords.lon, coords.lat, coords.lon);
              if (dist < distA) distA = dist;
            }
          });
        }
        if (connB && Array.isArray(connB)) {
          connB.forEach(s => {
            const coords = INTERCHANGE_COORDINATES[s.id];
            if (coords) {
              const dist = haversineDistance(anchorCoords.lat, anchorCoords.lon, coords.lat, coords.lon);
              if (dist < distB) distB = dist;
            }
          });
        }
      }
      if (distA !== distB) {
        return distA - distB;
      }
      // 3. Saved Status DESC
      const savedA = selectedLines.includes(a.id) ? 1 : 0;
      const savedB = selectedLines.includes(b.id) ? 1 : 0;
      return savedB - savedA;
    });
  }, [lineData, lineId, allLinesMap, selectedLines, anchorCoords]);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playSound('pop', 0.32);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const handleShare = async () => {
    if (!lineData) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    playSound('select', 0.45);

    const statusText = lineData.reason;
    const payload = statusText
      ? `${lineData.name} is ${lineData.status}. ${statusText.length > 120 ? statusText.slice(0, 120) + '...' : statusText}`
      : `${lineData.name} is ${lineData.status}.`;

    try {
      await Clipboard.setStringAsync(payload);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch (e) {
      console.log('Clipboard copy failed:', e);
    }
  };

  const shareLabel = copied
    ? 'Copied!'
    : (lineData && lineData.status_severity > 1 ? 'Share disruption' : 'Share line status');

  const backAnim = usePressAnimation('back_btn');
  const ctaBtnAnim = usePressAnimation('continue_btn');

  const isDisrupted = lineData ? lineData.status_severity > 1 : false;
  const severity = useMemo(() => severityFromNumber(lineData?.status_severity), [lineData?.status_severity]);

  const statusPillColors = useMemo(() => {
    if (!lineData) {
      return {
        bg: 'rgba(156, 163, 175, 0.18)',
        border: 'rgba(156, 163, 175, 0.3)',
        text: '#9CA3AF',
      };
    }
    if (lineData.status_severity === 1) {
      return {
        bg: 'rgba(16, 185, 129, 0.18)',
        border: 'rgba(16, 185, 129, 0.3)',
        text: '#10B981',
      };
    } else if (lineData.status_severity < 9) {
      return {
        bg: 'rgba(255, 176, 32, 0.18)',
        border: 'rgba(255, 176, 32, 0.3)',
        text: '#FFB020',
      };
    } else if (lineData.status_severity === 20 || lineData.status_severity >= 9) {
      return {
        bg: 'rgba(209, 67, 67, 0.18)',
        border: 'rgba(209, 67, 67, 0.3)',
        text: '#D14343',
      };
    }
    return {
      bg: 'rgba(156, 163, 175, 0.18)',
      border: 'rgba(156, 163, 175, 0.3)',
      text: '#9CA3AF',
    };
  }, [lineData]);

  const disruptionProgress = useDerivedValue(() => {
    return withTiming(isDisrupted ? 1 : 0, {
      duration: 600,
      easing: Easing.bezier(0.25, 1.0, 0.5, 1.0),
    });
  });

  const stateAStyle = useAnimatedStyle(() => {
    return {
      opacity: disruptionProgress.value,
      position: isDisrupted ? 'relative' : 'absolute',
      width: '100%',
      top: 0,
      left: 0,
    };
  }, [isDisrupted]);

  const stateBStyle = useAnimatedStyle(() => {
    return {
      opacity: 1 - disruptionProgress.value,
      position: !isDisrupted ? 'relative' : 'absolute',
      width: '100%',
      top: 0,
      left: 0,
    };
  }, [isDisrupted]);

  if (loading && !lineData) {
    return (
      <View style={styles.loadingContainer}>
        <DashboardGradient severity="unknown" />
        <Pressable style={styles.backButtonFloating} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
        </Pressable>
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text style={styles.loadingText}>Loading line details…</Text>
      </View>
    );
  }

  if (!lineData) {
    return (
      <View style={styles.errorContainer}>
        <DashboardGradient severity="unknown" />
        <Pressable style={styles.backButtonFloating} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
        </Pressable>
        <Ionicons name="alert-circle" size={48} color="#D14343" />
        <Text style={styles.errorText}>Failed to load line details</Text>
        <Pressable
          style={styles.retryButton}
          onPress={() => fetchAllLines(true)}
          accessibilityLabel="Retry loading line status"
          accessibilityRole="button"
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  // Header parameters
  const leftBarColor = lineId === 'northern' ? '#000000' : lineData.color;
  const isNorthern = lineId === 'northern';
  const lineNameFormatted = lineData.name.toLowerCase().endsWith(' line') ? lineData.name : `${lineData.name} line`;



  return (
    <View style={styles.root}>
      <DashboardGradient severity={severity} />
      {/* 1. THE FIXED INTEGRATED HEADER */}
      <View style={styles.header}>
        <View
          style={{
            paddingTop: insets.top + 12,
            paddingBottom: 12,
            paddingHorizontal: 16,
            flexDirection: 'row',
            alignItems: 'center',
            width: '100%',
          }}
        >
          <Pressable
            style={styles.backButton}
            onPress={handleBack}
            onPressIn={backAnim.onPressIn}
            onPressOut={backAnim.onPressOut}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Animated.View style={[styles.backIconContainer, backAnim.animatedStyle]}>
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </Animated.View>
          </Pressable>

          <Text style={styles.headerTitle} numberOfLines={1}>
            {lineNameFormatted}
          </Text>
        </View>
      </View>

      {/* 2. MAIN CONTENT SCROLL CONTAINER */}
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 76,
            paddingBottom: insets.bottom + 92,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Primary Glass Status Card */}
        <Animated.View
          layout={LinearTransition.duration(600).easing(Easing.bezier(0.25, 1.0, 0.5, 1.0))}
          style={styles.primaryStatusCard}
        >
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />

          {/* Hero Row */}
          <View style={styles.primaryHeroRow}>
            <View
              style={[
                styles.identityChip,
                { backgroundColor: leftBarColor },
                isNorthern && styles.northernAccentBarBorder,
              ]}
            />
            <Text style={styles.primaryTitle} numberOfLines={1}>{lineData.name}</Text>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: statusPillColors.bg,
                  borderColor: statusPillColors.border,
                },
              ]}
            >
              <Text style={[styles.statusPillText, { color: statusPillColors.text }]}>
                {lineData.status}
              </Text>
            </View>
          </View>

          {/* Copy Area */}
          <View style={styles.primaryCopyArea}>
            <Text style={styles.primaryCopyText}>
              {isDisrupted
                ? (lineData.reason || `${lineData.name}: Service is currently disrupted.`)
                : getBrandVoiceString(lineId)
              }
            </Text>
          </View>

          {/* Trust Footer */}
          <View style={styles.primaryTrustFooter}>
            <View style={[styles.trustBadge, { backgroundColor: dataFreshness.badgeColor }]}>
              <Text style={styles.trustBadgeLabel}>{dataFreshness.label}</Text>
            </View>
            <Text style={styles.relativeTimeText}>{dataFreshness.timeText}</Text>
          </View>
        </Animated.View>

        <View style={styles.transitionContainer}>
          {/* 🔴 STATE A: DISRUPTED VIEW */}
          <Animated.View
            style={[styles.stateAWrapper, stateAStyle]}
            pointerEvents={isDisrupted ? 'auto' : 'none'}
          >
            {/* Alternative Routes Section */}
            <View style={styles.alternativesSection}>
              <Text style={styles.sectionHeader}>Alternative routes</Text>
              {alternatives.length > 0 ? (
                <View style={styles.alternativeDeck}>
                  {alternatives.slice(0, 3).map((altLine) => {
                    const interchangeStations = getInterchangeStations(lineId, altLine.id);
                    const altPillColors = getStatusPillColors(altLine.status_severity);

                    return (
                      <Pressable
                        key={altLine.id}
                        style={styles.altCard}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          playSound('push', 0.38);
                          router.push({
                            pathname: '/(lineStack)/lineDetail',
                            params: { lineId: altLine.id },
                          });
                        }}
                      >
                        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />

                        <View style={styles.altCardContent}>
                          {/* Hero Row */}
                          <View style={styles.altCardHeader}>
                            <View style={[styles.altIdentityChip, { backgroundColor: altLine.color }]} />
                            <Text style={styles.altLineName} numberOfLines={1}>{altLine.name}</Text>
                            <View
                              style={[
                                styles.altStatusPill,
                                {
                                  backgroundColor: altPillColors.bg,
                                  borderColor: altPillColors.border,
                                },
                              ]}
                            >
                              <Text style={[styles.altStatusPillText, { color: altPillColors.text }]}>
                                {altLine.status}
                              </Text>
                            </View>
                          </View>

                          {/* Interchange Scroll Row */}
                          {interchangeStations.length > 0 && (
                            <View style={styles.interchangeScrollWrapper}>
                              <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.interchangeScrollContent}
                              >
                                {interchangeStations.map((station) => (
                                  <Pressable
                                    key={station.id}
                                    style={styles.stationCapsule}
                                    onPress={() => {
                                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                      playSound('select');
                                      router.push({
                                        pathname: '/stationDetail',
                                        params: { stationId: station.id, stationName: station.name },
                                      });
                                    }}
                                  >
                                    <Text style={styles.stationCapsuleText}>{station.name}</Text>
                                  </Pressable>
                                ))}
                              </ScrollView>
                              <LinearGradient
                                colors={['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0.06)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.rightFadeOverlay}
                                pointerEvents="none"
                              />
                            </View>
                          )}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                /* Honest Empty State */
                <Text style={styles.honestEmptyText}>
                  No clear alternatives right now.
                </Text>
              )}
            </View>
          </Animated.View>

          {/* 🟢 STATE B: NOMINAL VIEW */}
          <Animated.View
            style={[styles.stateBWrapper, stateBStyle]}
            pointerEvents={!isDisrupted ? 'auto' : 'none'}
          >
            {/* Demoted Timestamp */}
            <Text style={styles.demotedTimestamp}>
              Last updated: {dataFreshness.timeText}
            </Text>

            {/* Pinned Station Arrivals Deck */}
            {lineStations.length > 0 ? (
              <Animated.View
                entering={SlideInDown.duration(600).easing(Easing.bezier(0.25, 1.0, 0.5, 1.0))}
                layout={LinearTransition.duration(600).easing(Easing.bezier(0.25, 1.0, 0.5, 1.0))}
                style={styles.arrivalsDeck}
              >
                {lineStations.map((station) => {
                  const departures = stationDepartures[station.id] || [];
                  return (
                    <View key={station.id} style={styles.stationArrivalCard}>
                      <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFillObject} />
                      <View style={{ position: 'relative', zIndex: 1, width: '100%' }}>
                        <Text style={styles.arrivalsStationName}>{station.name}</Text>
                        {loadingDepartures && departures.length === 0 ? (
                          <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" style={styles.deckLoader} />
                        ) : departures.length > 0 ? (
                          <View style={styles.arrivalsRowsContainer}>
                            {departures.slice(0, 3).map((dep, index) => (
                              <View key={`${station.id}-dep-${index}`} style={styles.arrivalRow}>
                                <View style={styles.arrivalLeftFrame}>
                                  <Text style={styles.arrivalPlatform} numberOfLines={1}>
                                    {dep.platform || 'Platform info unavailable'}
                                  </Text>
                                  <Text style={styles.arrivalDestination} numberOfLines={1}>
                                    to {dep.destination}
                                  </Text>
                                </View>
                                <Text style={styles.arrivalMins}>
                                  {dep.minutes_away == null || dep.minutes_away < 0 || isNaN(dep.minutes_away)
                                    ? '—'
                                    : dep.minutes_away === 0
                                      ? 'Arriving'
                                      : `${dep.minutes_away} min`}
                                </Text>
                              </View>
                            ))}
                          </View>
                        ) : (
                          <Text style={styles.emptyDeckText}>No upcoming departures found</Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </Animated.View>
            ) : (
              <View style={styles.emptyDeckPrompt}>
                <Ionicons name="bookmark-outline" size={36} color="rgba(255, 255, 255, 0.25)" />
                <Text style={styles.emptyDeckPromptText}>
                  Pin stations along this line to view live departures here.
                </Text>
              </View>
            )}
          </Animated.View>
        </View>
      </ScrollView>

      {/* 3. THE PINNED BOTTOM ACTION PILL */}
      <View style={[styles.bottomPillContainer, { bottom: insets.bottom + 16 }]}>
        <Pressable
          onPress={handleShare}
          onPressIn={ctaBtnAnim.onPressIn}
          onPressOut={ctaBtnAnim.onPressOut}
          style={styles.pillPressable}
        >
          <Animated.View style={[styles.actionPill, ctaBtnAnim.animatedStyle]}>
            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFillObject} />
            <Text style={styles.pillText}>{shareLabel}</Text>
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0B',
  },
  flex1: {
    flex: 1,
  },
  backButtonFloating: {
    position: 'absolute',
    top: 60,
    left: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 18,
    color: '#D14343',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryButtonText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 14,
    color: '#000000',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  headerTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 20,
    color: '#FFFFFF',
    marginLeft: 8,
    flex: 1,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  backIconContainer: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leftAccentBar: {
    width: 4,
    height: 20,
    borderRadius: 2,
    marginRight: 10,
  },
  northernAccentBarBorder: {
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  lineTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 22,
    color: 'rgba(255, 255, 255, 0.95)',
    letterSpacing: -0.5,
  },
  statusLabel: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 13,
    marginTop: 2,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  stateAWrapper: {
    flex: 1,
    paddingTop: 12,
  },
  primaryStatusCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
    marginBottom: 24,
    padding: 16,
  },
  primaryHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
  },
  identityChip: {
    width: 42,
    height: 42,
    borderRadius: 10,
    marginRight: 12,
  },
  primaryTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 20,
    color: '#FFFFFF',
    flex: 1,
    marginRight: 8,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPillText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 12,
  },
  primaryCopyArea: {
    marginBottom: 16,
  },
  primaryCopyText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 21,
  },
  primaryTrustFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  trustBadgeContainer: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trustBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trustBadgeLabel: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 9,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  relativeTimeText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  transitionContainer: {
    position: 'relative',
    width: '100%',
    minHeight: 200,
  },
  alternativesSection: {
    marginTop: 8,
  },
  sectionHeader: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.58)',
    marginBottom: 12,
  },
  alternativeDeck: {
    gap: 10,
  },
  altCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    overflow: 'hidden',
  },
  altCardContent: {
    padding: 14,
    position: 'relative',
    zIndex: 1,
  },
  altCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  altIdentityChip: {
    width: 32,
    height: 32,
    borderRadius: 8,
    marginRight: 8,
  },
  altStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  altStatusPillText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 10,
  },
  interchangeScrollWrapper: {
    position: 'relative',
    marginTop: 12,
  },
  interchangeScrollContent: {
    gap: 6,
    paddingRight: 24,
  },
  stationCapsule: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  stationCapsuleText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 12,
    color: '#FFFFFF',
  },
  rightFadeOverlay: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 24,
  },
  altLineName: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 15,
    color: '#FFFFFF',
    flex: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  altRouteText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.55)',
  },
  honestEmptyText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.25,
    marginTop: 8,
  },
  stateBWrapper: {
    flex: 1,
    paddingTop: 12,
  },
  demotedTimestamp: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.35)',
    alignSelf: 'flex-end',
    marginBottom: 12,
  },
  arrivalsDeck: {
    gap: 16,
  },
  stationArrivalCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    overflow: 'hidden',
    position: 'relative',
  },
  arrivalsStationName: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 8,
  },
  arrivalsRowsContainer: {
    marginTop: 4,
  },
  arrivalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  arrivalLeftFrame: {
    flex: 1,
    paddingRight: 12,
  },
  arrivalPlatform: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.4)',
    marginBottom: 2,
  },
  arrivalDestination: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  arrivalMins: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  deckLoader: {
    marginVertical: 16,
  },
  emptyDeckText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.35)',
    textAlign: 'center',
    marginVertical: 8,
  },
  emptyDeckPrompt: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: 24,
  },
  emptyDeckPromptText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.35)',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 18,
  },
  bottomPillContainer: {
    position: 'absolute',
    left: 24,
    right: 24,
    zIndex: 100,
  },
  pillPressable: {
    width: '100%',
  },
  actionPill: {
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  pillText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 14,
    color: '#FFFFFF',
  },
});