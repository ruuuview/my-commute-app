import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Platform,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ✅ STEP 2: Import Zustand store and hook
import { useLine, useLines, useLineLoading, useLineError } from '../../store/lineDataStore';
import { useLineData } from '../../hooks/useLineData';

// Pre-defined alternative line mappings
const LINE_ALTERNATIVES: { [key: string]: string[] } = {
  'central': ['elizabeth', 'district'],
  'northern': ['victoria', 'jubilee'],
  'victoria': ['northern', 'piccadilly'],
  'piccadilly': ['victoria', 'northern'],
  'district': ['central', 'circle', 'hammersmith-city'],
  'circle': ['district', 'hammersmith-city', 'metropolitan'],
  'hammersmith-city': ['circle', 'district', 'metropolitan'],
  'metropolitan': ['circle', 'hammersmith-city'],
  'bakerloo': ['jubilee', 'northern'],
  'jubilee': ['northern', 'metropolitan'],
  'waterloo-city': ['northern', 'bakerloo'],
  'dlr': ['jubilee', 'elizabeth'],
  'elizabeth': ['central', 'dlr'],
  // ✅ FIX: TfL split Overground into 6 named lines - add all of them
  'liberty': ['jubilee', 'northern', 'elizabeth'],
  'lioness': ['jubilee', 'northern', 'bakerloo'],
  'mildmay': ['jubilee', 'northern', 'victoria'],
  'suffragette': ['jubilee', 'central', 'elizabeth'],
  'weaver': ['jubilee', 'central', 'elizabeth'],
  'windrush': ['jubilee', 'northern', 'dlr'],
};

// ✅ COMPLETE TfL INTERCHANGE DATABASE - All 171 line pair combinations
// Updated structure: Now includes station IDs (naptanId) for navigation and Pro/Free logic
interface InterchangeStation {
  id: string;
  name: string;
}

interface SharedTrackInfo {
  sharedTrack: string;
}

type ConnectionData = InterchangeStation[] | SharedTrackInfo;

// Complete database with all 171 unique line-pair combinations
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

interface LineData {
  id: string;
  name: string;
  color: string;
  status: string;
  status_severity: number;
  reason?: string;
  updated_at: string;
}

interface ConnectingLine {
  id: string;
  name: string;
  color: string;
}

interface StationInfo {
  id: string;
  name: string;
  status: 'open' | 'closed' | 'part_suspended' | 'no_service';
  status_description?: string;
  zone?: string;
  interchange?: boolean;
  connecting_lines?: ConnectingLine[];
}

interface LineDetailData extends LineData {
  stations: StationInfo[];
  branches?: {
    [branchName: string]: StationInfo[];
  };
}

// Helper function to get status color (traffic light system)
const getStatusColor = (severity: number): string => {
  if (severity <= 2) return '#00B04F'; // Green - Good Service
  if (severity <= 5) return '#F39C12'; // Amber/Yellow - Minor Delays  
  return '#E74C3C'; // Red - Severe Delays/Suspended
};

// Helper function to get station status color and icon
const getStationStatusIcon = (status: string): { icon: string; color: string } => {
  switch (status) {
    case 'closed':
      return { icon: 'close-circle', color: '#E74C3C' }; // Red
    case 'part_suspended':
      return { icon: 'warning', color: '#F39C12' }; // Amber
    case 'no_service':
      return { icon: 'remove-circle', color: '#E74C3C' }; // Red
    default:
      return { icon: 'checkmark-circle', color: '#00B04F' }; // Green
  }
};

// Helper function: Calculate trial days remaining
const getTrialDaysRemaining = (trialStartDate: string): number => {
  if (!trialStartDate) return 0;
  const startDate = new Date(trialStartDate);
  const currentDate = new Date();
  const daysSinceStart = Math.floor((currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const daysRemaining = Math.max(0, 45 - daysSinceStart);
  return daysRemaining;
};

// Helper function: Check if user has Pro access (either paid Pro or active trial)
const hasProAccess = (isPro: boolean, trialDaysRemaining: number): boolean => {
  return isPro || trialDaysRemaining > 0;
};

interface UserPreferences {
  is_pro: boolean;
  trial_start_date: string;
  saved_stations: string[];
  saved_lines: string[];
}

export default function LineDetailScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const navigation = useNavigation();
  const lineId = params.lineId as string;
  const lineName = params.lineName as string;
  const lineColor = params.lineColor as string;
  const fromLineId = params.fromLineId as string | undefined;  // ✅ FIX: Extract fromLineId for "Key Connections" card
  const fromLineName = params.fromLineName as string | undefined;  // ✅ FIX: Extract fromLineName for display

  // ✅ STEP 2: Get user preferences for Pro/Free logic
  const [userPrefs, setUserPrefs] = useState<UserPreferences>({
    is_pro: false,
    trial_start_date: '',
    saved_stations: [],
    saved_lines: [],
  });

  // Load user preferences on mount
  useEffect(() => {
    const loadUserPrefs = async () => {
      try {
        const prefsData = await AsyncStorage.getItem('user_preferences');
        if (prefsData) {
          setUserPrefs(JSON.parse(prefsData));
        }
      } catch (error) {
        console.error('Error loading user preferences:', error);
      }
    };
    loadUserPrefs();
  }, []);

  // ✅ STEP 2: Read data from Zustand store instead of local state
  const lineData = useLine(lineId);
  const allLinesMap = useLines();
  const loading = useLineLoading();
  const error = useLineError();
  
  // ✅ STEP 2: Use data fetching hook
  const { fetchAllLines } = useLineData();
  
  console.log('✨ Line Detail v3.0 - Using Zustand Store (Step 2 Migration)');
  console.log('📊 Line data from store:', lineData ? lineData.status : 'Not loaded');

  // ✅ STEP 2: Fetch data on mount if store is empty
  useEffect(() => {
    const loadData = async () => {
      // If we don't have data in the store yet, fetch it
      if (!lineData || Object.keys(allLinesMap).length === 0) {
        console.log('🔄 Store empty, fetching all lines...');
        await fetchAllLines();
      } else {
        console.log('✅ Using cached data from store');
      }
    };
    
    loadData();
  }, [lineId]); // Only re-run if lineId changes

  // ✅ STEP 2: Get alternative lines with good service (using store data)
  const getAlternativeLines = () => {
    if (!lineData || lineData.status_severity <= 2) {
      return []; // No alternatives needed for good service
    }

    const potentialAlternatives = LINE_ALTERNATIVES[lineId] || [];
    
    // Filter alternatives to only show those with good service
    const goodAlternatives = potentialAlternatives
      .map(altLineId => allLinesMap[altLineId])
      .filter(altLine => altLine && altLine.status_severity <= 2); // Good service or minor delays only
    
    return goodAlternatives;
  };

  // ✅ Get connection data from complete database
  const getConnectionData = (line1Id: string, line2Id: string): ConnectionData | null => {
    // Sort IDs to create consistent key
    const key = [line1Id, line2Id].sort().join('-');
    const data = COMPLETE_INTERCHANGE_DB[key];
    
    // Return null only if data is empty array (no connection)
    if (Array.isArray(data) && data.length === 0) {
      return null;
    }
    
    return data || null;
  };

  // ✅ STEP 3: Show upgrade modal for free users
  const showUpgradeModal = () => {
    Alert.alert(
      'Unlock All Station Departures',
      'Get live departure times for any station. Upgrade to Pro for unlimited access.\n\nPay once, own it forever. Just £7.99.',
      [
        { text: 'Not Now', style: 'cancel' },
        { text: 'Upgrade for Life - £7.99', onPress: () => router.push('/settings') },
      ]
    );
  };

  // ✅ STEP 3: Handle station tap with 3-scenario Pro/Free logic
  const handleStationTap = (tappedStationId: string) => {
    console.log('🚉 Station tapped:', tappedStationId);
    
    const trialDaysRemaining = getTrialDaysRemaining(userPrefs.trial_start_date);
    const isPro = userPrefs.is_pro;

    // Scenario 1: User is Pro (or in trial)
    if (hasProAccess(isPro, trialDaysRemaining)) {
      console.log('✅ User is Pro/Trial. Navigating to station detail.');
      router.push(`/stationDetail?stationId=${tappedStationId}`);
      return;
    }

    // User is on the Free plan. Check if the station is one of their saved ones.
    const isStationSaved = userPrefs.saved_stations.includes(tappedStationId);

    // Scenario 3: Free user, tapped a station they have already saved
    if (isStationSaved) {
      console.log('✅ User is Free, but station is saved. Navigating.');
      router.push(`/stationDetail?stationId=${tappedStationId}`);
      return;
    }

    // Scenario 2: Free user, tapped a station that is NOT saved
    console.log('🔒 User is Free, station not saved. Showing upgrade modal.');
    showUpgradeModal();
  };

  const alternatives = getAlternativeLines();

  const handleBack = () => {
    console.log('🔙 Back button pressed');
    console.log('🔙 Can go back:', router.canGoBack());
    console.log('🔙 Current params:', params);
    
    if (router.canGoBack()) {
      router.back();
    } else {
      // Fallback to dashboard if no history
      router.push('/');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading line details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!lineData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#E74C3C" />
          <Text style={styles.errorText}>Failed to load line details</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchAllLines(true)}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Sharp Header - Line-branded */}
      <View style={[styles.header, { backgroundColor: lineData.color }]}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.lineTitle}>{lineData.name}</Text>
      </View>

      {/* Content Area */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Status Card with Left Border Accent */}
        <View style={[
          styles.statusCard,
          {
            borderLeftColor: lineData.status_severity >= 7 ? '#D32F2F' : 
                            lineData.status_severity >= 3 ? '#FFA000' : '#388E3C',
            borderLeftWidth: 6,
          }
        ]}>
          <Text style={styles.statusTitle}>{lineData.status}</Text>
          
          {lineData.reason && (
            <Text style={styles.statusDescription}>{lineData.reason}</Text>
          )}
          
          <Text style={styles.statusTimestamp}>
            Updated: {new Date(lineData.updated_at).toLocaleTimeString()}
          </Text>
        </View>

        {/* ✅ Key Connections Card - 3-tier logic using COMPLETE database */}
        {fromLineId && fromLineName && (() => {
          const connectionData = getConnectionData(fromLineId, lineId);
          console.log('🔍 KEY CONNECTIONS DEBUG:');
          console.log('  fromLineId:', fromLineId);
          console.log('  lineId:', lineId);
          console.log('  connectionData:', connectionData);
          
          // Tier 1: Check if this is a "shared track" pair
          if (connectionData && 'sharedTrack' in connectionData) {
            return (
              <View style={styles.keyConnectionsCard}>
                <View style={styles.keyConnectionsHeader}>
                  <Ionicons name="git-branch" size={24} color="#007AFF" />
                  <Text style={styles.keyConnectionsTitle}>
                    Key Connections with {fromLineName}
                  </Text>
                </View>
                <Text style={styles.sharedTrackMessage}>
                  {connectionData.sharedTrack}
                </Text>
              </View>
            );
          }
          
          // Tier 2: Check if we have specific interchange stations
          if (connectionData && Array.isArray(connectionData) && connectionData.length > 0) {
            return (
              <View style={styles.keyConnectionsCard}>
                <View style={styles.keyConnectionsHeader}>
                  <Ionicons name="swap-horizontal" size={24} color="#007AFF" />
                  <Text style={styles.keyConnectionsTitle}>
                    Key Connections with {fromLineName}
                  </Text>
                </View>
                <Text style={styles.keyConnectionsSubtitle}>
                  Switch between these lines at the following stations:
                </Text>
                <View style={styles.connectionStationsList}>
                  {connectionData.map((station, index) => {
                    return (
                      <TouchableOpacity 
                        key={index} 
                        style={styles.connectionStationItem}
                        onPress={() => handleStationTap(station.id)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="locate" size={20} color="#007AFF" />
                        <Text style={styles.connectionStationName}>{station.name}</Text>
                        <Ionicons name="chevron-forward" size={20} color="#999" />
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.keyConnectionsNote}>
                  💡 Tap a station in your "Stations" list for live departure times
                </Text>
              </View>
            );
          }
          
          // Tier 3: Fallback to Journey Planner button (no connection data or empty array)
          console.log('🔵 TIER 3: Rendering Find Connections card with Journey Planner button');
          return (
            <View style={styles.keyConnectionsCard}>
              <View style={styles.keyConnectionsHeader}>
                <Ionicons name="swap-horizontal" size={24} color="#007AFF" />
                <Text style={styles.keyConnectionsTitle}>
                  Find Connections with {fromLineName}
                </Text>
              </View>
              <Text style={styles.keyConnectionsSubtitle}>
                Use our Journey Planner to find the best interchange stations between these lines.
              </Text>
              <View style={{ backgroundColor: 'yellow', padding: 20, marginTop: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: 'black' }}>
                  TEST: CAN YOU SEE THIS YELLOW BOX?
                </Text>
              </View>
              <TouchableOpacity 
                style={{ backgroundColor: 'red', padding: 20, marginTop: 16, borderRadius: 10 }}
                onPress={() => {
                  console.log('🚀 Journey Planner button pressed!');
                  router.push('/journeyPlanner');
                }}
              >
                <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold', textAlign: 'center' }}>
                  OPEN JOURNEY PLANNER
                </Text>
              </TouchableOpacity>
            </View>
          );
        })()}

        {/* Journey Planner Card - Show BELOW Key Connections card when fromLineId exists */}
        {fromLineId && fromLineName && (
          <View style={styles.journeyPlannerCard}>
            <Text style={styles.journeyPlannerTitle}>Need to plan another route?</Text>
            <TouchableOpacity 
              style={styles.planJourneyButton}
              onPress={() => router.push('/journeyPlanner')}
            >
              <Text style={styles.planJourneyButtonText}>Plan Journey</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {/* Alternatives List - Only show if disrupted */}
        {lineData.status_severity > 2 && alternatives.length > 0 && (
          <View style={styles.alternativesCard}>
            <Text style={styles.alternativesTitle}>✨ Try These Alternatives</Text>
            {alternatives.map((altLine) => (
              <TouchableOpacity
                key={altLine.id}
                style={styles.alternativeItem}
                onPress={() => {
                  // ✅ REVERT: Use router.push() since navigation.push() doesn't work with Expo Router
                  console.log(`📍 Navigating from ${lineData.name} to ${altLine.name}`);
                  router.push({
                    pathname: '/lineDetail',
                    params: {
                      lineId: altLine.id,
                      lineName: altLine.name,
                      lineColor: altLine.color,
                      fromLineId: lineData.id,
                      fromLineName: lineData.name,
                      fromLineColor: lineData.color
                    }
                  });
                }}
              >
                <View style={[styles.lineColorSwatch, { backgroundColor: altLine.color }]} />
                <View style={styles.alternativeContent}>
                  <Text style={styles.alternativeLineName}>{altLine.name}</Text>
                  <View style={styles.alternativeStatusRow}>
                    <Ionicons name="checkmark-circle" size={18} color="#00B04F" />
                    <Text style={styles.alternativeStatusText}>{altLine.status}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#999" />
              </TouchableOpacity>
            ))}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6F9', // Clean neutral background
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 0, // Sharp corners for header
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  lineTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  // Status Card with Left Border Accent
  statusCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 24, // 24px vertical spacing
    borderRadius: 12, // Rounded corners
    padding: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  statusDescription: {
    fontSize: 15,
    lineHeight: 24,
    color: '#666',
    marginBottom: 16,
  },
  statusTimestamp: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
  },
  // ✅ Key Connections Card Styles
  keyConnectionsCard: {
    backgroundColor: '#E3F2FD',
    marginHorizontal: 16,
    marginTop: 24,
    borderRadius: 12,
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
    ...Platform.select({
      ios: {
        shadowColor: '#007AFF',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  keyConnectionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  keyConnectionsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#007AFF',
    marginLeft: 12,
    flex: 1,
  },
  keyConnectionsSubtitle: {
    fontSize: 15,
    color: '#555',
    marginBottom: 16,
  },
  connectionStationsList: {
    gap: 12,
  },
  connectionStationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  connectionStationName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginLeft: 12,
  },
  keyConnectionsNote: {
    fontSize: 13,
    color: '#666',
    marginTop: 16,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  sharedTrackMessage: {
    fontSize: 15,
    color: '#333',
    lineHeight: 24,
    marginTop: 8,
  },
  journeyPlannerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginTop: 16,
    gap: 10,
  },
  journeyPlannerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Alternatives Card
  alternativesCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 24, // 24px vertical spacing
    borderRadius: 12,
    padding: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  alternativesTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 16,
  },
  alternativeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  lineColorSwatch: {
    width: 4,
    height: 48,
    borderRadius: 2,
    marginRight: 16,
  },
  alternativeContent: {
    flex: 1,
  },
  alternativeLineName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  alternativeStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  alternativeStatusText: {
    fontSize: 14,
    color: '#00B04F',
    fontWeight: '500',
  },
  // Journey Planner Card - Always Visible
  journeyPlannerCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 24, // 24px vertical spacing
    marginBottom: 24, // Bottom margin for last card
    borderRadius: 12,
    padding: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  journeyPlannerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  planJourneyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    gap: 8,
  },
  planJourneyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Loading & Error States
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#E74C3C',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});