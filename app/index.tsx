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

export const stationDataCache = new Map<string, Promise<any>>();

export default function MyCommuteDashboard() {
  const router = useRouter();
  
  const [userPrefs, setUserPrefs] = useState<UserPreferences>({
    saved_lines: ['central', 'victoria'],
    saved_stations: ['940GZZLUOXC', '940GZZLUKSX'], 
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

  // Keep background sync for non-interactive updates
  const fetchWidgetData = useCallback(async () => {
    try {
      await fetchAllLines(true); 
      const freshLines = Object.values(useLineDataStore.getState().lines);
      const prefsJson = await AsyncStorage.getItem('user_preferences');
      const currentPrefs = prefsJson ? JSON.parse(prefsJson) : { saved_lines: [] };
      
      const myLines = freshLines.filter((l: any) => 
        currentPrefs.saved_lines.includes(l.id)
      );

      return { myLines }; 
    } catch (e) {
      console.warn("Widget background fetch failed", e);
      return null;
    }
  }, [fetchAllLines]);

  useWidgetSync(fetchWidgetData);

  useEffect(() => {
    loadUserPreferences();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchDashboardData(undefined, true);
    }, [])
  );

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
    } catch (error) {
      console.error('Error loading prefs:', error);
    }
  };

  const fetchDashboardData = async (prefsOverride?: UserPreferences, forceRefresh = false) => {
    const activePrefs = prefsOverride || userPrefs;
    setErrorMsg(null);
    
    try {
      // 1. Load cached data
      const cachedLines = Object.values(useLineDataStore.getState().lines);
      if (cachedLines.length > 0) {
        const activeCachedLines = cachedLines.filter((line: LineStatus) => 
          activePrefs.saved_lines.includes(line.id)
        );
        setLineStatuses(activeCachedLines);
      }

      // 2. Fetch fresh data
      await fetchAllLines(forceRefresh);
      
      const allLinesArray = Object.values(useLineDataStore.getState().lines);
      const filteredLines = allLinesArray.filter((line: LineStatus) => 
        activePrefs.saved_lines.includes(line.id)
      );
      setLineStatuses(filteredLines); 

      // 3. Fetch Stations
      if (activePrefs.saved_stations.length > 0) {
        const stationIds = activePrefs.saved_stations.join(',');
        const response = await fetch(`${BACKEND_URL}/api/stations/batch?ids=${encodeURIComponent(stationIds)}`);
        if (!response.ok) throw new Error('Station fetch failed');
        const batchData = await response.json();
        setStationData(batchData.stations || {}); 
      }
    } catch (err: any) {
      console.error('Fetch Error:', err);
      setErrorMsg(err.message);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData(undefined, true);
    setRefreshing(false);
  };

  const startJiggle = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(jiggleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
        Animated.timing(jiggleAnim, { toValue: -1, duration: 100, useNativeDriver: true }),
        Animated.timing(jiggleAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
      ])
    ).start();
  };

  const toggleEditMode = () => {
    if (isEditing) {
      setIsEditing(false);
      jiggleAnim.stopAnimation();
      jiggleAnim.setValue(0);
    } else {
      setIsEditing(true);
      startJiggle();
    }
  };

  // 🚦 APP SORTING: Match the widget by pushing worst delays to the top
  const sortedSavedLines = useMemo(() => {
    return [...userPrefs.saved_lines].sort((idA, idB) => {
      const lineA = lineStatuses.find(l => l.id === idA) || Object.values(allLinesFromStore).find(l => l.id === idA);
      const lineB = lineStatuses.find(l => l.id === idB) || Object.values(allLinesFromStore).find(l => l.id === idB);
      const severityA = lineA?.status_severity ?? 10;
      const severityB = lineB?.status_severity ?? 10;
      return severityA - severityB; 
    });
  }, [userPrefs.saved_lines, lineStatuses, allLinesFromStore]);

  const renderLineItem = (lineId: string) => {
    const line = lineStatuses.find(l => l.id === lineId) || 
                 Object.values(allLinesFromStore).find(l => l.id === lineId) ||
                 { id: lineId, name: lineId, color: '#ccc', status: 'Loading...', status_severity: 0 };

    const theme = getSeverityTheme(line.status_severity);

    // 🎨 UI UNIFORMITY: Match Ionicons exactly to the SF Symbols in the Widget
    let iconName: keyof typeof Ionicons.glyphMap = 'checkmark';
    if (line.status_severity < 7) {
      iconName = 'close'; // Match "xmark"
    } else if (line.status_severity >= 7 && line.status_severity <= 9) {
      iconName = 'warning'; // Match "exclamationmark.triangle.fill"
    }

    return (
      <Animated.View key={lineId} style={{
        transform: isEditing ? [{ rotate: jiggleAnim.interpolate({
          inputRange: [-1, 1], outputRange: ['-1deg', '1deg']
        })}] : []
      }}>
        <TouchableOpacity 
          style={[styles.card, { backgroundColor: theme.gradientStart }]}
          onLongPress={toggleEditMode}
          onPress={() => {
            if (!isEditing) {
              router.push({ pathname: '/lineDetail', params: { lineId: line.id, lineName: line.name, lineColor: line.color }});
            }
          }}
        >
          <View style={styles.cardContent}>
            <View>
              <Text style={[styles.lineName, { color: theme.text }]}>{line.name}</Text>
              
              <View style={styles.statusRow}>
                {/* 🎨 UI UNIFORMITY: White circle background behind icon */}
                <View style={styles.iconCircle}>
                  <Ionicons name={iconName} size={14} color={theme.icon} />
                </View>
                <Text style={[styles.statusText, { color: theme.textSecondary }]}>
                  {line.status}
                </Text>
              </View>
            </View>
          </View>
          
          {isEditing && (
            <TouchableOpacity 
              style={styles.deleteBadge}
              onPress={() => {
                const newLines = userPrefs.saved_lines.filter(id => id !== lineId);
                const newPrefs = { ...userPrefs, saved_lines: newLines };
                setUserPrefs(newPrefs);
                AsyncStorage.setItem('user_preferences', JSON.stringify(newPrefs));
                fetchDashboardData(newPrefs, true);
              }}
            >
              <Ionicons name="remove" size={16} color="white" />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderStationItem = (stationId: string) => {
    const station = stationData[stationId];
    
    if (!station) return (
      <View key={stationId} style={styles.card}>
        <ActivityIndicator color="#007AFF" />
        <Text style={{marginLeft: 10, color: '#666'}}>Loading...</Text>
      </View>
    );

    return (
      <Animated.View key={stationId} style={{
        transform: isEditing ? [{ rotate: jiggleAnim.interpolate({
          inputRange: [-1, 1], outputRange: ['-1deg', '1deg']
        })}] : []
      }}>
        <TouchableOpacity 
          style={styles.card}
          onLongPress={toggleEditMode}
          onPress={() => {
            if (!isEditing) router.push({ pathname: '/stationDetail', params: { stationId, stationName: station.name }});
          }}
        >
          <View style={styles.stationContent}>
            <Text style={styles.stationName}>{station.name}</Text>
            {station.departures.length > 0 ? (
              station.departures.slice(0, 2).map((dep, idx) => (
                <View key={idx} style={styles.departureRow}>
                  <Text style={styles.depLine}>{dep.line}</Text>
                  <Text style={styles.depDest} numberOfLines={1}>{dep.destination}</Text>
                  <Text style={styles.depTime}>{dep.minutes_away} min</Text>
                </View>
              ))
            ) : (
              <Text style={styles.noDepText}>No live departures</Text>
            )}
          </View>

          {isEditing && (
            <TouchableOpacity 
              style={styles.deleteBadge}
              onPress={() => {
                const newStations = userPrefs.saved_stations.filter(id => id !== stationId);
                const newPrefs = { ...userPrefs, saved_stations: newStations };
                setUserPrefs(newPrefs);
                AsyncStorage.setItem('user_preferences', JSON.stringify(newPrefs));
                setStationData(prev => { const n = {...prev}; delete n[stationId]; return n; });
              }}
            >
              <Ionicons name="remove" size={16} color="white" />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <LinearGradient colors={['#007AFF', '#f5f5f7']} style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <SafeAreaView edges={['top']} style={styles.header}>
        <Text style={styles.headerTitle}>MY COMMUTE</Text>
        <TouchableOpacity onPress={() => setShowAddManageModal(true)}>
          <Ionicons name="add-circle" size={32} color="white" />
        </TouchableOpacity>
      </SafeAreaView>

      {errorMsg && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>Connection Error: {errorMsg}</Text>
        </View>
      )}

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="white" />}
      >
        <Text style={styles.sectionTitle}>My Lines</Text>
        {/* Render the dynamically sorted lines instead of the raw array */}
        {sortedSavedLines.map(renderLineItem)}

        <Text style={styles.sectionTitle}>My Stations</Text>
        {userPrefs.saved_stations.map(renderStationItem)}
        
        {isEditing && (
          <TouchableOpacity style={styles.doneButton} onPress={toggleEditMode}>
            <Text style={styles.doneText}>Done Editing</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <AddManageModal 
        visible={showAddManageModal}
        onClose={() => setShowAddManageModal(false)}
        savedLines={userPrefs.saved_lines}
        savedStations={userPrefs.saved_stations}
        onSave={async (lines, stations) => {
          const newPrefs = { ...userPrefs, saved_lines: lines, saved_stations: stations };
          setUserPrefs(newPrefs);
          await AsyncStorage.setItem('user_preferences', JSON.stringify(newPrefs));
          fetchDashboardData(newPrefs, true);
        }}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: 'white',
    letterSpacing: 1,
  },
  scrollContent: { padding: 16, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginTop: 20,
    marginBottom: 10,
    marginLeft: 4,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lineName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconCircle: {
    backgroundColor: 'white',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  stationContent: { flex: 1 },
  stationName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  departureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  depLine: { fontSize: 12, color: '#666', width: 60 },
  depDest: { fontSize: 12, color: '#333', flex: 1 },
  depTime: { fontSize: 12, fontWeight: '700', color: '#007AFF' },
  noDepText: { fontSize: 12, color: '#999', fontStyle: 'italic' },
  errorBanner: {
    backgroundColor: '#ff3b30',
    padding: 12,
    marginHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  errorText: { color: 'white', fontWeight: '600', fontSize: 12 },
  deleteBadge: {
    position: 'absolute',
    top: -10,
    left: -10,
    backgroundColor: '#ff3b30',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  doneButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  doneText: { color: 'white', fontWeight: '700', fontSize: 16 },
});