import { getSeverityTheme } from '../utils/widgetSync';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Animated,
  StatusBar,
  ActivityIndicator,
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

const BACKEND_URL = APP_CONFIG.BACKEND_URL;

interface LineStatus {
  id: string;
  name: string;
  color: string;
  status: string;
  status_severity: number;
  status_color?: string; // NEW: Single Source of Truth
  status_icon?: string;  // NEW: Single Source of Truth
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
  const [isEditing, setIsEditing] = useState(false);
  const [showAddManageModal, setShowAddManageModal] = useState(false);
  const jiggleAnim = useRef(new Animated.Value(0)).current;
  
  const allLinesFromStore = useLines();
  const { fetchAllLines } = useLineData();
  const [lineStatuses, setLineStatuses] = useState<LineStatus[]>([]);

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
        fetchDashboardData(parsed, true);
      } else {
        fetchDashboardData(userPrefs, true);
      }
    } catch (error) { console.error(error); }
  };

  const fetchDashboardData = async (prefsOverride?: UserPreferences, forceRefresh = false) => {
    const activePrefs = prefsOverride || userPrefs;
    try {
      await fetchAllLines(forceRefresh);
      const allLinesArray = Object.values(useLineDataStore.getState().lines);
      const filteredLines = allLinesArray.filter((line: LineStatus) => 
        activePrefs.saved_lines.includes(line.id)
      );
      setLineStatuses(filteredLines); 

      if (activePrefs.saved_stations.length > 0) {
        const response = await fetch(`${BACKEND_URL}/api/stations/batch?ids=${activePrefs.saved_stations.join(',')}`);
        const batchData = await response.json();
        setStationData(batchData.stations || {}); 
      }
    } catch (err: any) { setErrorMsg(err.message); }
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
    
    // 🎨 UI LOBOTOMY: Trust Backend or Fallback to Corrected Scale
    const cardBg = line.status_color || theme.gradientStart;
    
    let iconName: any = theme.iconName;
    if (line.status_icon) {
      if (line.status_icon === 'xmark') iconName = 'close';
      else if (line.status_icon === 'clock') iconName = 'time';
      else if (line.status_icon === 'warning') iconName = 'warning';
      else if (line.status_icon === 'checkmark') iconName = 'checkmark';
    }

    // Special styling for Suspended (Extreme Red)
    const isSuspended = cardBg === '#E32017' || line.status_severity <= 5;

    return (
      <Animated.View key={lineId}>
        <TouchableOpacity 
          style={[styles.card, { backgroundColor: cardBg }]}
          onPress={() => router.push({ pathname: '/lineDetail', params: { lineId: line.id }})}
        >
          <View style={styles.cardContent}>
            <View>
              <Text style={[styles.lineName, { color: '#FFFFFF' }]}>{line.name}</Text>
              <View style={styles.statusRow}>
                <View style={[
                    styles.iconCircle, 
                    isSuspended && { borderColor: '#000000', borderWidth: 1.5 }
                ]}>
                  <Ionicons name={iconName} size={14} color={cardBg} />
                </View>
                <Text style={[styles.statusText, { color: 'rgba(255,255,255,0.9)' }]}>
                  {line.status}
                </Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderStationItem = (stationId: string) => {
    const station = stationData[stationId];
    if (!station) return null;
    return (
      <TouchableOpacity key={stationId} style={styles.card} onPress={() => {}}>
        <View style={styles.stationContent}>
          <Text style={styles.stationName}>{station.name}</Text>
          {station.departures.slice(0, 2).map((dep, idx) => (
            <View key={idx} style={styles.departureRow}>
              <Text style={styles.depLine}>{dep.line}</Text>
              <Text style={styles.depDest}>{dep.destination}</Text>
              <Text style={styles.depTime}>{dep.minutes_away} min</Text>
            </View>
          ))}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradient colors={['#007AFF', '#f5f5f7']} style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <Text style={styles.headerTitle}>MY COMMUTE</Text>
        <TouchableOpacity onPress={() => setShowAddManageModal(true)}>
          <Ionicons name="add-circle" size={32} color="white" />
        </TouchableOpacity>
      </SafeAreaView>
      <ScrollView contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchDashboardData(undefined, true)} tintColor="white" />}>
        <Text style={styles.sectionTitle}>My Lines</Text>
        {sortedSavedLines.map(renderLineItem)}
        <Text style={styles.sectionTitle}>My Stations</Text>
        {userPrefs.saved_stations.map(renderStationItem)}
      </ScrollView>
      <AddManageModal visible={showAddManageModal} onClose={() => setShowAddManageModal(false)} savedLines={userPrefs.saved_lines} savedStations={userPrefs.saved_stations} onSave={async (l, s) => {
          const p = { ...userPrefs, saved_lines: l, saved_stations: s };
          setUserPrefs(p);
          await AsyncStorage.setItem('user_preferences', JSON.stringify(p));
          fetchDashboardData(p, true);
      }} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 28, fontWeight: '800', color: 'white' },
  scrollContent: { padding: 16 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#333', marginTop: 20, marginBottom: 10 },
  card: { borderRadius: 16, padding: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center' },
  cardContent: { flex: 1 },
  lineName: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconCircle: { backgroundColor: 'white', width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  statusText: { fontSize: 14, fontWeight: '600' },
  stationContent: { flex: 1 },
  stationName: { fontSize: 16, fontWeight: '700', marginBottom: 8, color: '#333' },
  departureRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  depLine: { fontSize: 12, color: '#666', width: 60 },
  depDest: { fontSize: 12, color: '#333', flex: 1 },
  depTime: { fontSize: 12, fontWeight: '700', color: '#007AFF' },
});