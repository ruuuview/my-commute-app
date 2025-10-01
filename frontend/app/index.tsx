import React, { useState, useEffect } from 'react';
import {
  Text,
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  StatusBar,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Types
interface LineStatus {
  id: string;
  name: string;
  color: string;
  status: string;
  status_severity: number;
  reason?: string;
  updated_at: string;
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

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

export default function MyCommuteDashboard() {
  const [userPrefs, setUserPrefs] = useState<UserPreferences>({
    saved_lines: ['central', 'victoria'],
    saved_stations: ['940GZZLUOXC'], // Real TfL station ID for Oxford Circus
    is_pro: false,
  });
  const [lineStatuses, setLineStatuses] = useState<LineStatus[]>([]);
  const [stationData, setStationData] = useState<{ [key: string]: StationData }>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [allLines, setAllLines] = useState<LineStatus[]>([]);
  const [setupMode, setSetupMode] = useState<'lines' | 'stations' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Mock feature flag for Pro features
  const [devMode, setDevMode] = useState(false);

  useEffect(() => {
    loadUserPreferences();
    fetchDashboardData();
  }, []);

  const loadUserPreferences = async () => {
    try {
      const saved = await AsyncStorage.getItem('user_preferences');
      if (saved) {
        setUserPrefs(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
    }
  };

  const saveUserPreferences = async (prefs: UserPreferences) => {
    try {
      await AsyncStorage.setItem('user_preferences', JSON.stringify(prefs));
      setUserPrefs(prefs);
    } catch (error) {
      console.error('Error saving preferences:', error);
    }
  };

  const fetchDashboardData = async () => {
    try {
      // Fetch all lines for setup mode
      const allLinesResponse = await fetch(`${BACKEND_URL}/api/lines`);
      const allLinesData = await allLinesResponse.json();
      setAllLines(allLinesData);

      // Fetch user's saved line statuses
      const linePromises = userPrefs.saved_lines.map(async (lineId) => {
        const response = await fetch(`${BACKEND_URL}/api/lines/${lineId}`);
        return response.json();
      });
      const lineData = await Promise.all(linePromises);
      setLineStatuses(lineData);

      // Fetch user's saved station data
      const stationPromises = userPrefs.saved_stations.map(async (stationId) => {
        const response = await fetch(`${BACKEND_URL}/api/stations/${stationId}`);
        return response.json();
      });
      const stationResults = await Promise.all(stationPromises);
      
      const stationMap: { [key: string]: StationData } = {};
      stationResults.forEach((station) => {
        stationMap[station.id] = station;
      });
      setStationData(stationMap);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      Alert.alert('Error', 'Failed to load commute data. Please check your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Good Service':
        return '#28a745';
      case 'Minor Delays':
        return '#ffc107';
      case 'Severe Delays':
      case 'Suspended':
        return '#dc3545';
      case 'Planned Closure':
        return '#6f42c1';
      default:
        return '#6c757d';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Good Service':
        return 'checkmark-circle';
      case 'Minor Delays':
        return 'time';
      case 'Severe Delays':
      case 'Suspended':
        return 'warning';
      case 'Planned Closure':
        return 'close-circle';
      default:
        return 'information-circle';
    }
  };

  const toggleLineInPreferences = (lineId: string) => {
    const newSavedLines = userPrefs.saved_lines.includes(lineId)
      ? userPrefs.saved_lines.filter(id => id !== lineId)
      : [...userPrefs.saved_lines, lineId];
    
    // Free version limit: max 3 lines total
    const totalItems = newSavedLines.length + userPrefs.saved_stations.length;
    if (!userPrefs.is_pro && !devMode && totalItems > 3) {
      Alert.alert(
        'Upgrade to Pro',
        'Free version allows up to 3 items total (lines + stations). Upgrade to Pro for unlimited.',
        [{ text: 'OK' }]
      );
      return;
    }

    const newPrefs = { ...userPrefs, saved_lines: newSavedLines };
    saveUserPreferences(newPrefs);
    fetchDashboardData();
  };

  const toggleStationInPreferences = (stationId: string) => {
    const newSavedStations = userPrefs.saved_stations.includes(stationId)
      ? userPrefs.saved_stations.filter(id => id !== stationId)
      : [...userPrefs.saved_stations, stationId];
    
    // Free version limit: max 3 items total
    const totalItems = userPrefs.saved_lines.length + newSavedStations.length;
    if (!userPrefs.is_pro && !devMode && totalItems > 3) {
      Alert.alert(
        'Upgrade to Pro', 
        'Free version allows up to 3 items total (lines + stations). Upgrade to Pro for unlimited.',
        [{ text: 'OK' }]
      );
      return;
    }

    const newPrefs = { ...userPrefs, saved_stations: newSavedStations };
    saveUserPreferences(newPrefs);
    fetchDashboardData();
  };

  const searchStations = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/stations/search/${encodeURIComponent(query)}`);
      const results = await response.json();
      setSearchResults(results);
    } catch (error) {
      console.error('Error searching stations:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchInput = (text: string) => {
    setSearchQuery(text);
    if (setupMode === 'stations') {
      searchStations(text);
    }
  };

  const renderLineItem = (line: LineStatus) => (
    <View key={line.id} style={styles.lineItem}>
      <View style={[styles.lineIndicator, { backgroundColor: line.color }]} />
      <View style={styles.lineContent}>
        <Text style={styles.lineName}>{line.name}</Text>
        <View style={styles.statusRow}>
          <Ionicons
            name={getStatusIcon(line.status) as any}
            size={16}
            color={getStatusColor(line.status)}
            style={styles.statusIcon}
          />
          <Text style={[styles.statusText, { color: getStatusColor(line.status) }]}>
            {line.status}
          </Text>
        </View>
        {line.reason && (
          <Text style={styles.reasonText}>{line.reason}</Text>
        )}
      </View>
    </View>
  );

  const renderStationItem = (stationId: string) => {
    const station = stationData[stationId];
    if (!station) return null;

    return (
      <View key={stationId} style={styles.stationItem}>
        <View style={styles.stationHeader}>
          <Ionicons name="train" size={20} color="#007AFF" />
          <Text style={styles.stationName}>{station.name}</Text>
        </View>
        <View style={styles.departuresContainer}>
          {station.departures.slice(0, 3).map((departure, index) => (
            <View key={index} style={styles.departureRow}>
              <Text style={styles.departureLine}>{departure.line}</Text>
              <Text style={styles.departureDestination} numberOfLines={1}>
                {departure.destination}
              </Text>
              <Text style={styles.departureTime}>{departure.minutes_away} min</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderSetupMode = () => (
    <ScrollView style={styles.setupContainer}>
      <Text style={styles.setupTitle}>Choose Your Lines</Text>
      <Text style={styles.setupSubtitle}>
        Select up to {userPrefs.is_pro || devMode ? 'unlimited' : '3'} lines for your dashboard
      </Text>
      
      {allLines.map((line) => (
        <TouchableOpacity
          key={line.id}
          style={[
            styles.setupLineItem,
            userPrefs.saved_lines.includes(line.id) && styles.setupLineItemSelected
          ]}
          onPress={() => toggleLineInPreferences(line.id)}
        >
          <View style={[styles.lineIndicator, { backgroundColor: line.color }]} />
          <Text style={styles.setupLineName}>{line.name}</Text>
          {userPrefs.saved_lines.includes(line.id) && (
            <Ionicons name="checkmark" size={20} color="#007AFF" />
          )}
        </TouchableOpacity>
      ))}
      
      <TouchableOpacity
        style={styles.setupDoneButton}
        onPress={() => setIsSetupMode(false)}
      >
        <Text style={styles.setupDoneText}>Done</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading your commute...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isSetupMode) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setIsSetupMode(false)}>
            <Ionicons name="close" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Setup</Text>
          <View style={{ width: 24 }} />
        </View>
        {renderSetupMode()}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Commute</Text>
        <View style={styles.headerActions}>
          {/* Dev Mode Toggle - Hidden feature for testing Pro features */}
          <TouchableOpacity
            onPress={() => setDevMode(!devMode)}
            onLongPress={() => {
              Alert.alert('Dev Mode', devMode ? 'Pro features disabled' : 'Pro features enabled');
            }}
          >
            <Text style={[styles.devModeText, devMode && styles.devModeActive]}>•</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={() => setSetupMode('lines')}
            style={styles.setupButton}
          >
            <Ionicons name="settings-outline" size={24} color="#007AFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Dashboard Content */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Welcome Message */}
        {userPrefs.saved_lines.length === 0 && userPrefs.saved_stations.length === 0 && (
          <View style={styles.welcomeContainer}>
            <Ionicons name="train" size={48} color="#007AFF" />
            <Text style={styles.welcomeTitle}>Welcome to My Commute!</Text>
            <Text style={styles.welcomeText}>
              Your personal London commute dashboard. Tap the settings icon to add your lines and stations.
            </Text>
            <TouchableOpacity
              style={styles.getStartedButton}
              onPress={() => setIsSetupMode(true)}
            >
              <Text style={styles.getStartedText}>Get Started</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Lines Section */}
        {lineStatuses.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>My Lines</Text>
            {lineStatuses.map(renderLineItem)}
          </View>
        )}

        {/* Stations Section */}
        {Object.keys(stationData).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Stations</Text>
            {userPrefs.saved_stations.map(renderStationItem)}
          </View>
        )}

        {/* Pro Features Preview */}
        {!userPrefs.is_pro && !devMode && (
          <View style={styles.proPreview}>
            <Text style={styles.proTitle}>Unlock Pro Features</Text>
            <Text style={styles.proDescription}>
              • Unlimited lines and stations
              • Custom notification rules
              • Offline mode for underground
              • Home screen widget
            </Text>
            <TouchableOpacity style={styles.upgradeButton}>
              <Text style={styles.upgradeText}>Upgrade for £7.99</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  devModeText: {
    fontSize: 24,
    color: '#ccc',
    marginRight: 16,
  },
  devModeActive: {
    color: '#007AFF',
  },
  setupButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  welcomeContainer: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  welcomeText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  getStartedButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  getStartedText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    margin: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  lineItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  lineIndicator: {
    width: 4,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  lineContent: {
    flex: 1,
    padding: 16,
  },
  lineName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    marginRight: 6,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  reasonText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  stationItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  stationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  stationName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  departuresContainer: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
  },
  departureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  departureLine: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
    width: 60,
  },
  departureDestination: {
    fontSize: 14,
    color: '#333',
    flex: 1,
    marginHorizontal: 8,
  },
  departureTime: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  setupContainer: {
    flex: 1,
    padding: 16,
  },
  setupTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  setupSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  setupLineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  setupLineItemSelected: {
    borderColor: '#007AFF',
  },
  setupLineName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    flex: 1,
    marginLeft: 12,
  },
  setupDoneButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  setupDoneText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  proPreview: {
    margin: 16,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#007AFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  proTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 8,
  },
  proDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 16,
  },
  upgradeButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  upgradeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
