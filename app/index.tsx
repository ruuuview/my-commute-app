import { getSeverityTheme } from '../utils/widgetSync';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { APP_CONFIG } from '../config/app.config';
import { useLineData } from '../hooks/useLineData';
import { useLines, useLineDataStore } from '../store/lineDataStore';
import AddManageModal from './AddManageModal';
import { useWidgetSync } from '../hooks/useWidgetSync';

// --- NEW PREMIUM COMPONENTS ---
import BouncyButton from '../components/BouncyButton';
import TrafficLightLoader from '../components/TrafficLightLoader';
import LivingDot from '../components/LivingDot';
import StatusDot from '../components/StatusDot';
import ErrorToast from '../components/ErrorToast';
import { DashboardSkeleton } from '../components/DashboardSkeleton';
import { useDataFreshness } from '../hooks/useDataFreshness';

const BACKEND_URL = APP_CONFIG.BACKEND_URL;

interface LineStatus {
  id: string;
  name: string;
  color: string;
  status: string;
  status_severity: number;
  status_color?: string; 
  status_icon?: string;  
  is_disrupted?: boolean;
}

interface Departure {
  line: string;
  destination: string;
  platform: string;
  expected_arrival: string;
  minutes_away: number;
}

interface StationData {
  id: string;
  name: string;
  lines: string[];
  departures: Departure[];
  updated_at: string;
}

interface UserPreferences {
  saved_lines: string[];
  saved_stations: string[];
  is_pro: boolean;
}

export default function MyCommuteDashboard() {
  const router = useRouter();
  const [userPrefs, setUserPrefs] = useState<UserPreferences>({
    saved_lines: ['central', 'victoria'],
    saved_stations: [], 
    is_pro: false,
  });

  const [stationData, setStationData] = useState<{ [key: string]: StationData }>({});
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showAddManageModal, setShowAddManageModal] = useState(false);
  
  const allLinesFromStore = useLines();
  const { fetchAllLines } = useLineData();
  const [lineStatuses, setLineStatuses] = useState<LineStatus[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);

  // Data Freshness Hook
  const { tier, ageText, setLastFetch } = useDataFreshness();

  const fetchWidgetData = useCallback(async () => {
    try {
      await fetchAllLines(true); 
      const freshLines = Object.values(useLineDataStore.getState().lines);
      const prefsJson = await AsyncStorage.getItem('user_preferences');
      const currentPrefs = prefsJson ? JSON.parse(prefsJson) : { saved_lines: [] };
      const myLines = freshLines.filter((l: any) => currentPrefs.saved_lines.includes(l.id));
      return { myLines }; 
    } catch (e) {
      return null;
    }
  }, [fetchAllLines]);

  useWidgetSync(fetchWidgetData);

  useEffect(() => { loadUserPreferences(); }, []);
  useFocusEffect(useCallback(() => { fetchDashboardData(undefined, true); }, []));

  const loadUserPreferences = async () => {
    try {
      const savedPrefs = await AsyncStorage.getItem('user_preferences');
      if (savedPrefs) {
        const parsed = JSON.parse(savedPrefs);
        setUserPrefs(parsed);
        await fetchDashboardData(parsed, true);
      } else {
        await fetchDashboardData(userPrefs, true);
      }
    } catch (error) { 
      console.error(error); 
    } finally {
      setInitialLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData(undefined, true);
    setRefreshing(false);
  };

  const fetchDashboardData = async (prefsOverride?: UserPreferences, forceRefresh = false) => {
    const activePrefs = prefsOverride || userPrefs;
    setErrorMsg(null);
    let fetchSuccess = true;

    try {
      const cachedLines = Object.values(useLineDataStore.getState().lines);
      if (cachedLines.length > 0) {
        const activeCachedLines = cachedLines.filter((line: LineStatus) => 
          activePrefs.saved_lines.includes(line.id)
        );
        setLineStatuses(activeCachedLines);
      }

      await fetchAllLines(forceRefresh);

      const allLinesArray = Object.values(useLineDataStore.getState().lines);
      const filteredLines = allLinesArray.filter((line: LineStatus) => 
        activePrefs.saved_lines.includes(line.id)
      );
      setLineStatuses(filteredLines);
    } catch (err: any) {
      console.warn("Lines fetch error:", err.message);
      setErrorMsg("Trouble connecting to TfL. Some data may be outdated.");
      fetchSuccess = false;
    }

    if (activePrefs.saved_stations.length > 0) {
      try {
        const stationIds = activePrefs.saved_stations.join(',');
        const response = await fetch(
          BACKEND_URL + "/api/stations/batch?ids=" + encodeURIComponent(stationIds)
        );

        if (response.ok) {
          const batchData = await response.json();
          if (batchData.stations && Object.keys(batchData.stations).length > 0) {
            setStationData(prev => ({ ...prev, ...batchData.stations }));
          }
        } else {
          console.warn("Stations backend error " + response.status);
          fetchSuccess = false;
        }
      } catch (err: any) {
        console.warn("Stations fetch error:", err.message);
        setErrorMsg("Unable to refresh live departures.");
        fetchSuccess = false;
      }
    }

    if (fetchSuccess) {
      setLastFetch(Date.now());
    }
  };

  const sortedSavedLines = useMemo(() => {
    return [...userPrefs.saved_lines].sort((idA, idB) => {
      const lineA = lineStatuses.find(l => l.id === idA) || { status_severity: 10 };
      const lineB = lineStatuses.find(l => l.id === idB) || { status_severity: 10 };
      return (lineA.status_severity || 10) - (lineB.status_severity || 10); 
    });
  }, [userPrefs.saved_lines, lineStatuses]);

  const renderLineItem = (lineId: string) => {
    const line = lineStatuses.find(l => l.id === lineId) || 
                 { id: lineId, name: lineId, color: '#ccc', status: 'Loading...', status_severity: 10 };

    const theme = getSeverityTheme(line.status_severity);
    const cardBg = line.status_color || theme.gradientStart;
    
    let iconName: any = theme.iconName;
    if (line.status_icon) {
      if (line.status_icon === 'xmark') iconName = 'close';
      else if (line.status_icon === 'clock') iconName = 'time';
      else if (line.status_icon === 'warning') iconName = 'warning';
      else if (line.status_icon === 'checkmark') iconName = 'checkmark';
    }

    const isSuspended = cardBg === '#E32017' || line.status_severity <= 5;
    const isGoodService = line.status_severity === 10;

    return (
      <BouncyButton
        key={lineId}
        scaleDown={0.96}
        haptic="light"
        onPress={() => router.push({ pathname: '/lineDetail', params: { lineId: line.id }})}
        style={[styles.card, { backgroundColor: cardBg }]}
      >
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <Text style={[styles.lineName, { color: '#FFFFFF' }]}>{line.name}</Text>
            {isGoodService ? (
              <LivingDot color="#FFFFFF" size={8} />
            ) : (
              <StatusDot severity={line.status_severity} pulse={isSuspended} size={10} />
            )}
          </View>
          <View style={styles.statusRow}>
            <View style={[
                styles.iconCircle, 
                isSuspended && { borderColor: '#000000', borderWidth: 1.5 }
            ]}>
              <Ionicons name={iconName} size={14} color={cardBg} />
            </View>
            <Text style={[styles.statusText, { color: 'rgba(255,255,255,0.95)' }]}>
              {line.status}
            </Text>
          </View>
        </View>
      </BouncyButton>
    );
  };

  const renderStationItem = (stationId: string) => {
    const station = stationData[stationId];
    if (!station) return null;
    return (
      <BouncyButton 
        key={stationId} 
        scaleDown={0.96}
        haptic="light"
        onPress={() => {}} 
        style={[styles.card, styles.stationCard]}
      >
        <View style={styles.stationContent}>
          <Text style={styles.stationName}>{station.name}</Text>
          {station.departures.slice(0, 2).map((dep, idx) => (
            <View key={idx} style={styles.departureRow}>
              <Text style={styles.depLine}>{dep.line}</Text>
              <View style={styles.depRight}>
                <Text style={styles.depDest} numberOfLines={1}>{dep.destination}</Text>
                <Text style={[styles.depTime, dep.minutes_away < 2 && styles.depTimeUrgent]}>
                  {dep.minutes_away} min
                </Text>
              </View>
            </View>
          ))}
        </View>
      </BouncyButton>
    );
  };

  if (initialLoading) {
    return (
      <SafeAreaView style={styles.container}>
         <DashboardSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <ErrorToast 
        visible={!!errorMsg} 
        message={errorMsg || ''} 
        onDismiss={() => setErrorMsg(null)} 
      />
      
      <SafeAreaView edges={['top']} style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Commute</Text>
          <Text style={styles.freshnessText}>
            {refreshing ? 'Updating...' : `Updated ${ageText}`}
          </Text>
        </View>
        <View style={styles.headerActions}>
          {refreshing && <TrafficLightLoader size="small" horizontal />}
          <BouncyButton haptic="medium" onPress={() => setShowAddManageModal(true)}>
            <Ionicons name="add-circle" size={32} color="#1C1C1E" />
          </BouncyButton>
        </View>
      </SafeAreaView>

      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh} 
            tintColor="#1C1C1E" 
          />
        }
      >
        <Text style={styles.sectionTitle}>My Lines</Text>
        {sortedSavedLines.map(renderLineItem)}
        
        {userPrefs.saved_stations.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>My Stations</Text>
            {userPrefs.saved_stations.map(renderStationItem)}
          </>
        )}
      </ScrollView>

      <AddManageModal 
        visible={showAddManageModal} 
        onClose={() => setShowAddManageModal(false)} 
        savedLines={userPrefs.saved_lines} 
        savedStations={userPrefs.saved_stations} 
        onSave={async (l, s) => {
          const p = { ...userPrefs, saved_lines: l, saved_stations: s };
          setUserPrefs(p);
          await AsyncStorage.setItem('user_preferences', JSON.stringify(p));
          fetchDashboardData(p, true);
        }} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1,
    backgroundColor: '#F2F2F7', // Premium Apple Light Mode background
  },
  header: { 
    paddingHorizontal: 20, 
    paddingTop: 10,
    paddingBottom: 15,
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-end' 
  },
  headerTitle: { 
    fontSize: 34, 
    fontWeight: '800', 
    color: '#1C1C1E',
    letterSpacing: -1.2, // Space Grotesk premium tracking
  },
  freshnessText: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: -0.2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scrollContent: { 
    padding: 20,
    paddingTop: 0,
  },
  sectionTitle: { 
    fontSize: 22, 
    fontWeight: '800', 
    color: '#1C1C1E', 
    marginTop: 24, 
    marginBottom: 12,
    letterSpacing: -0.8,
  },
  card: { 
    borderRadius: 20, // Rounded HIG corners
    padding: 18, 
    marginBottom: 14, 
    flexDirection: 'row', 
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  stationCard: {
    backgroundColor: '#FFFFFF',
  },
  cardContent: { flex: 1 },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  lineName: { 
    fontSize: 20, 
    fontWeight: '800', 
    letterSpacing: -0.5,
  },
  statusRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.15)', // Premium pill background
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  iconCircle: { 
    backgroundColor: 'white', 
    width: 18, 
    height: 18, 
    borderRadius: 9, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  statusText: { 
    fontSize: 13, 
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  stationContent: { flex: 1 },
  stationName: { 
    fontSize: 18, 
    fontWeight: '800', 
    marginBottom: 12, 
    color: '#1C1C1E',
    letterSpacing: -0.5,
  },
  departureRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: '#F2F2F7',
    padding: 10,
    borderRadius: 12,
  },
  depLine: { 
    fontSize: 13, 
    fontWeight: '700',
    color: '#8E8E93', 
    width: 65,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  depRight: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  depDest: { 
    fontSize: 15, 
    fontWeight: '600',
    color: '#1C1C1E', 
    flex: 1,
    marginRight: 10,
  },
  depTime: { 
    fontSize: 15, 
    fontWeight: '800', 
    color: '#2A9D5C', // Emerald
  },
  depTimeUrgent: {
    color: '#D93025', // Crimson for arriving soon
  }
});