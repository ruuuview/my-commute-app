import { APP_CONFIG } from '../config/app.config';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLines } from '../store/lineDataStore';
import { useLineData } from '../hooks/useLineData';

// ✅ Use Config
const BACKEND_URL = APP_CONFIG.BACKEND_URL;

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
};

interface Station {
  id: string;
  name: string;
  lines: { id: string; name: string }[];
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
  const allLinesMap = useLines();
  const allLines = Object.values(allLinesMap);
  const { fetchAllLines } = useLineData();
   
  const [selectedLines, setSelectedLines] = useState<string[]>(savedLines);
  const [selectedStations, setSelectedStations] = useState<string[]>(savedStations);
  const [stationSearchQuery, setStationSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Station[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (visible) {
      setSelectedLines([...savedLines]);
      setSelectedStations([...savedStations]);
      if (allLines.length === 0) fetchAllLines();
    }
  }, [visible]);

  useEffect(() => {
    if (stationSearchQuery.trim().length >= 3) {
      const timer = setTimeout(() => searchStations(stationSearchQuery.trim()), 750);
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
    }
  }, [stationSearchQuery]);

  const searchStations = async (query: string) => {
    setIsSearching(true);
    try {
      console.log(`Searching: ${BACKEND_URL}/api/stations/search/${query}`);
      const response = await fetch(`${BACKEND_URL}/api/stations/search/${encodeURIComponent(query)}`);
      
      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }
      
      const stations = await response.json();
      setSearchResults(stations);
    } catch (error: any) {
      console.error('Search error:', error);
      // 🚨 Alert the user if search fails so we know WHY
      Alert.alert("Connection Error", error.message);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const toggleLine = (id: string) => {
    setSelectedLines(prev => prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]);
  };

  const toggleStation = (id: string) => {
    setSelectedStations(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  // --- V533 FIX: TRIGGER WIDGET SYNC ON SAVE ---
  const handleSave = () => {
    // 1. Update App State
    onSave(selectedLines, selectedStations);
    
    // 2. Filter the full line objects to only include the ones user selected
    const linesToSync = allLines.filter(line => selectedLines.includes(line.id));
    
    // 3. Send to Widget immediately
    
    // 4. Close Modal
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1}}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={28} color="#000" />
            </TouchableOpacity>
            <Text style={styles.title}>Manage Commute</Text>
            <TouchableOpacity onPress={handleSave} style={styles.saveBtn}>
              <Text style={styles.saveText}>Save</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tabs}>
            <TouchableOpacity style={[styles.tab, activeTab === 'lines' && styles.activeTab]} onPress={() => setActiveTab('lines')}>
              <Text style={styles.tabText}>Lines</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, activeTab === 'stations' && styles.activeTab]} onPress={() => setActiveTab('stations')}>
              <Text style={styles.tabText}>Stations</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            {activeTab === 'lines' ? (
              <ScrollView>
                {allLines.map(line => (
                  <TouchableOpacity key={line.id} style={styles.item} onPress={() => toggleLine(line.id)}>
                    <View style={{flexDirection: 'row', alignItems: 'center'}}>
                      <View style={[styles.dot, {backgroundColor: line.color}]} />
                      <Text style={styles.itemName}>{line.name}</Text>
                    </View>
                    {selectedLines.includes(line.id) && <Ionicons name="checkmark-circle" size={24} color="#007AFF" />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <View style={{flex: 1}}>
                <View style={styles.searchBox}>
                  <Ionicons name="search" size={20} color="#666" />
                  <TextInput 
                    style={styles.input} 
                    placeholder="Search stations (e.g. Bank)..." 
                    value={stationSearchQuery}
                    onChangeText={setStationSearchQuery}
                  />
                </View>
                <ScrollView>
                  {searchResults.map(station => (
                    <TouchableOpacity key={station.id} style={styles.item} onPress={() => toggleStation(station.id)}>
                      <Text style={styles.itemName}>{station.name}</Text>
                      {selectedStations.includes(station.id) && <Ionicons name="checkmark-circle" size={24} color="#007AFF" />}
                    </TouchableOpacity>
                  ))}
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
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: '#eee' },
  title: { fontSize: 18, fontWeight: '600' },
  closeBtn: { padding: 4 },
  saveBtn: { backgroundColor: '#007AFF', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 8 },
  saveText: { color: '#fff', fontWeight: '600' },
  tabs: { flexDirection: 'row', padding: 16, backgroundColor: '#f8f9fa' },
  tab: { flex: 1, padding: 10, alignItems: 'center', borderRadius: 8 },
  activeTab: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
  tabText: { fontWeight: '500' },
  content: { flex: 1, padding: 16 },
  item: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: '#f0f0f0' },
  itemName: { fontSize: 16 },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  searchBox: { flexDirection: 'row', backgroundColor: '#f0f0f0', padding: 12, borderRadius: 10, marginBottom: 16 },
  input: { flex: 1, marginLeft: 10, fontSize: 16 },
});
