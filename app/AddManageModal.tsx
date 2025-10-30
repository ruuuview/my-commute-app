import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  SafeAreaView,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
// ✅ Import Zustand store AND data fetching hook
import { useLines } from '../store/lineDataStore';
import { useLineData } from '../hooks/useLineData';

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

// TfL Official Line Colors
const LINE_COLORS: { [key: string]: string } = {
  'bakerloo': '#B36305',
  'central': '#E32017',
  'circle': '#FFD300',
  'district': '#00782A',
  'hammersmith-city': '#F3A9BB',
  'jubilee': '#A0A5A9',
  'metropolitan': '#9B0056',
  'northern': '#000000',
  'piccadilly': '#003688',
  'victoria': '#0098D4',
  'waterloo-city': '#95CDBA',
  'dlr': '#00A4A7',
  'elizabeth': '#7156A5',
  'london-overground': '#EE7C0E',
  'tram': '#84B817',
  // National Rail - generic color
  'great-western-railway': '#003087',
  'heathrow-express': '#6B2C91',
  'c2c': '#E21836',
  'southeastern': '#00ADEF',
  'southern': '#00A650',
  'south-western-railway': '#004B87',
  'thameslink': '#C70A76',
  'gatwick-express': '#E9168C',
};

interface LineStatus {
  id: string;
  name: string;
  color: string;
  status: string;
  status_severity: number;
}

// Helper function to get status text color based on severity (traffic light system)
const getStatusColor = (severity: number): string => {
  if (severity <= 2) return '#00B04F'; // Green - Good Service
  if (severity <= 5) return '#F39C12'; // Amber/Yellow - Minor Delays  
  return '#E74C3C'; // Red - Severe Delays/Suspended
};

interface LineInfo {
  id: string;
  name: string;
}

interface Station {
  id: string;
  name: string;
  lines: LineInfo[];
}

interface AddManageModalProps {
  visible: boolean;
  onClose: () => void;
  savedLines: string[];
  savedStations: string[];
  onSave: (lines: string[], stations: string[]) => void;
}

export default function AddManageModal({ 
  visible, 
  onClose, 
  savedLines, 
  savedStations, 
  onSave 
}: AddManageModalProps) {
  const [activeTab, setActiveTab] = useState<'lines' | 'stations'>('lines');
  // ✅ Use Zustand store for data
  const allLinesMap = useLines();
  const allLines: LineStatus[] = Object.values(allLinesMap);
  
  // ✅ Use data fetching hook to populate store if empty
  const { fetchAllLines } = useLineData();
  
  const [selectedLines, setSelectedLines] = useState<string[]>(savedLines);
  const [selectedStations, setSelectedStations] = useState<string[]>(savedStations);
  const [stationSearchQuery, setStationSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Station[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Animation for modal slide up - use useRef to persist across renders
  const slideAnim = useRef(new Animated.Value(Dimensions.get('window').height)).current;

  // ✅ Update selected items and fetch data if store is empty
  useEffect(() => {
    if (visible) {
      setSelectedLines([...savedLines]);
      setSelectedStations([...savedStations]);
      
      // If store is empty, fetch data
      // (Dashboard doesn't populate store yet - it's Step 3)
      if (allLines.length === 0) {
        console.log('🔄 Add/Manage Modal: Store empty, fetching lines...');
        fetchAllLines();
      } else {
        console.log(`✅ Add/Manage Modal: Using ${allLines.length} lines from store`);
      }
    }
  }, [visible, savedLines, savedStations, allLines.length, fetchAllLines]);

  // Station search with debouncing - PERFORMANCE: Increased to 750ms to reduce "no results" flash
  useEffect(() => {
    if (stationSearchQuery.trim().length >= 3) {
      const searchTimeout = setTimeout(() => {
        searchStations(stationSearchQuery.trim());
      }, 750); // Increased from 600ms to 750ms to prevent "no results" flash
      return () => clearTimeout(searchTimeout);
    } else {
      setSearchResults([]);
      setIsSearching(false);
    }
  }, [stationSearchQuery]);

  const searchStations = async (query: string) => {
    setIsSearching(true);
    try {
      // 🔴 LIVE TfL API SEARCH - Query real stations from TfL
      console.log(`🔍 SEARCHING TfL API for: "${query}"`);
      
      const response = await fetch(
        `${BACKEND_URL}/api/stations/search/${encodeURIComponent(query)}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }
      
      const stations = await response.json();
      console.log(`✅ Found ${stations.length} stations from TfL`);
      console.log('📊 First station data:', stations[0]); // Debug: check what backend returns
      
      // Transform TfL API results to our Station format (including lines)
      const formattedStations: Station[] = stations.map((station: any) => ({
        id: station.id,
        name: station.name,
        lines: station.lines || [] // CRITICAL: Include lines from backend
      }));
      
      console.log('📊 Formatted first station:', formattedStations[0]); // Debug: check formatting
      setSearchResults(formattedStations);
    } catch (error) {
      console.error('❌ Station search error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const toggleLine = (lineId: string) => {
    setSelectedLines(prev => 
      prev.includes(lineId) 
        ? prev.filter(id => id !== lineId)
        : [...prev, lineId]
    );
  };

  const toggleStation = (stationId: string) => {
    setSelectedStations(prev => 
      prev.includes(stationId) 
        ? prev.filter(id => id !== stationId)
        : [...prev, stationId]
    );
  };

  const handleSave = () => {
    onSave(selectedLines, selectedStations);
    handleClose();
  };

  const handleDone = () => {
    onSave(selectedLines, selectedStations);
    handleClose();
  };

  const handleClose = () => {
    onClose();
    // Reset state
    setStationSearchQuery('');
    setSearchResults([]);
    setActiveTab('lines');
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.fullScreenContainer}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoidingView}
          keyboardVerticalOffset={0}
        >
          {/* Header */}
          <View style={styles.fullScreenHeader}>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={28} color="#000" />
            </TouchableOpacity>
            <Text style={styles.fullScreenTitle}>Add to Your Commute</Text>
            <TouchableOpacity onPress={handleSave} style={styles.saveButton}>
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>

            {/* Tab Toggle */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'lines' && styles.activeTab]}
                onPress={() => setActiveTab('lines')}
              >
                <Text style={[styles.tabText, activeTab === 'lines' && styles.activeTabText]}>
                  Lines
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'stations' && styles.activeTab]}
                onPress={() => setActiveTab('stations')}
              >
                <Text style={[styles.tabText, activeTab === 'stations' && styles.activeTabText]}>
                  Stations
                </Text>
              </TouchableOpacity>
            </View>

            {/* Content */}
            <View style={styles.content}>
              {activeTab === 'lines' ? (
                <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                  {allLines.map((line) => (
                    <TouchableOpacity
                      key={line.id}
                      style={styles.lineItem}
                      onPress={() => toggleLine(line.id)}
                    >
                      <View style={styles.lineInfo}>
                        <View style={[styles.lineIndicator, { backgroundColor: line.color }]} />
                        <View style={styles.lineDetails}>
                          <Text style={styles.lineName}>{line.name}</Text>
                          <Text style={[styles.lineStatus, { color: getStatusColor(line.status_severity) }]}>
                            {line.status}
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.checkbox, selectedLines.includes(line.id) && styles.checkedBox]}>
                        {selectedLines.includes(line.id) && (
                          <Ionicons name="checkmark" size={16} color="#fff" />
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : (
                <View style={styles.stationsTab}>
                  {/* Search Bar */}
                  <View style={styles.searchContainer}>
                    <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Search for stations..."
                      value={stationSearchQuery}
                      onChangeText={setStationSearchQuery}
                      returnKeyType="search"
                    />
                  </View>

                  {/* Search Results */}
                  <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                    {stationSearchQuery.trim().length < 3 ? (
                      <View style={styles.searchHint}>
                        <Text style={styles.hintText}>Enter at least 3 characters to search for stations</Text>
                      </View>
                    ) : searchResults.length === 0 && !isSearching ? (
                      <View style={styles.searchHint}>
                        <Text style={styles.hintText}>No stations found for "{stationSearchQuery}"</Text>
                      </View>
                    ) : (
                      searchResults.map((station) => (
                        <TouchableOpacity
                          key={station.id}
                          style={styles.stationItemContainer}
                          onPress={() => toggleStation(station.id)}
                        >
                          <View style={styles.stationItemContent}>
                            <View style={styles.stationHeader}>
                              <Ionicons name="location" size={20} color="#007AFF" />
                              <Text style={styles.stationName}>{station.name}</Text>
                            </View>
                            
                            {/* Line Pills */}
                            {station.lines && station.lines.length > 0 && (
                              <View style={styles.linePillsContainer}>
                                {station.lines.map((line) => {
                                  const pillColor = LINE_COLORS[line.id] || '#666666';
                                  const textColor = ['#FFD300', '#F3A9BB'].includes(pillColor) ? '#000' : '#FFF';
                                  
                                  return (
                                    <View 
                                      key={line.id} 
                                      style={[styles.linePill, { backgroundColor: pillColor }]}
                                    >
                                      <Text style={[styles.linePillText, { color: textColor }]}>
                                        {line.name}
                                      </Text>
                                    </View>
                                  );
                                })}
                              </View>
                            )}
                          </View>
                          
                          <View style={[styles.checkbox, selectedStations.includes(station.id) && styles.checkedBox]}>
                            {selectedStations.includes(station.id) && (
                              <Ionicons name="checkmark" size={16} color="#fff" />
                            )}
                          </View>
                        </TouchableOpacity>
                      ))
                    )}
                  </ScrollView>
                </View>
              )}
            </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Full-screen modal styles
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  fullScreenHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
    backgroundColor: '#fff',
  },
  fullScreenTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    flex: 1,
    textAlign: 'center',
  },
  closeButton: {
    padding: 8,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Legacy styles (keeping for compatibility)
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '85%',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  doneButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  doneText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  tabContainer: {
    flexDirection: 'row',
    margin: 16,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 6,
  },
  activeTab: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
  },
  activeTabText: {
    color: '#333',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  scrollView: {
    flex: 1,
  },
  lineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  lineInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  lineIndicator: {
    width: 4,
    height: 40,
    borderRadius: 2,
    marginRight: 12,
  },
  lineDetails: {
    flex: 1,
  },
  lineName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  lineStatus: {
    fontSize: 14,
    color: '#666',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkedBox: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  stationsTab: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 16,
    color: '#333',
  },
  stationItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  stationItemContent: {
    flex: 1,
    flexDirection: 'column',
    marginRight: 12,
  },
  stationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  stationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  stationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  stationName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginLeft: 12,
  },
  linePillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginLeft: 32,
    marginTop: 4,
    gap: 6,
  },
  linePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 4,
  },
  linePillText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  searchHint: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  hintText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});