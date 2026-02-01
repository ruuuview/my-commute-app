import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert, AppState, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { syncToWidget } from '../../utils/widgetSync';

// Define the Line Type
type Line = {
  id: string;
  name: string;
  status: string;
  statusDescription?: string;
};

export default function TabOneScreen() {
  const router = useRouter();
  const [myLines, setMyLines] = useState<Line[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // 1. LOAD DATA
  const loadLines = async () => {
    try {
      const stored = await AsyncStorage.getItem('myLines');
      if (stored) {
        const parsed = JSON.parse(stored);
        setMyLines(parsed);
        syncToWidget(parsed);
      }
    } catch (e) {
      console.error("Failed to load lines", e);
    }
  };

  // 2. APP STATE LISTENER (Auto-Wake Fix)
  useEffect(() => {
    loadLines();

    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') {
        console.log('⚡️ App Woke Up! Syncing Widget...');
        AsyncStorage.getItem('myLines').then(stored => {
            if (stored) syncToWidget(JSON.parse(stored));
        });
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // 3. REFRESH HANDLER
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadLines();
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  // 4. DELETE LINE (Ghost Line Fix)
  const deleteLine = async (id: string) => {
    Alert.alert("Remove Line", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Remove", 
        style: "destructive", 
        onPress: async () => {
          const newLines = myLines.filter(l => l.id !== id);
          setMyLines(newLines);
          await AsyncStorage.setItem('myLines', JSON.stringify(newLines));
          // INSTANTLY Update Widget
          syncToWidget(newLines);
        }
      }
    ]);
  };

  // 5. HELPER: Get Color based on Status
  const getStatusColor = (status: string) => {
    const s = (status || "").toLowerCase();
    if (s.includes('severe') || s.includes('closed') || s.includes('suspend')) return '#FF3B30'; // Red
    if (s.includes('minor') || s.includes('delay') || s.includes('busy')) return '#FF9500'; // Amber
    return '#34C759'; // Green
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.title}>MY COMMUTE</Text>
        <TouchableOpacity onPress={() => router.push('/modal')}>
          <Ionicons name="add-circle" size={32} color="#007AFF" />
        </TouchableOpacity>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        
        {/* SECTION: MY LINES */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Lines</Text>
        </View>

        {myLines.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No lines added yet.</Text>
            <Text style={styles.emptySubText}>Tap + to add your commute.</Text>
          </View>
        ) : (
          myLines.map((line) => (
            <TouchableOpacity 
              key={line.id} 
              style={[styles.card, { borderLeftColor: getStatusColor(line.status || line.statusDescription || "") }]}
              onLongPress={() => deleteLine(line.id)}
            >
              <View style={styles.cardContent}>
                <Text style={styles.lineName}>{line.name}</Text>
                <View style={styles.statusRow}>
                  <Ionicons 
                    name={getStatusColor(line.status || "").includes('34C759') ? "checkmark-circle" : "warning"} 
                    size={16} 
                    color={getStatusColor(line.status || "")} 
                  />
                  <Text style={[styles.statusText, { color: getStatusColor(line.status || "") }]}>
                    {line.status || line.statusDescription || "Unknown"}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
            </TouchableOpacity>
          ))
        )}

        {/* SECTION: MY STATIONS */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Stations</Text>
        </View>
        <View style={styles.stationCard}>
            <Text style={styles.stationTitle}>Oxford Circus Underground Station</Text>
            <View style={styles.stationRow}><Text style={styles.lineLabel}>Bakerloo</Text><Text style={styles.timeText}>0 min</Text></View>
            <View style={styles.stationRow}><Text style={styles.lineLabel}>Central</Text><Text style={styles.timeText}>0 min</Text></View>
        </View>

         <View style={styles.stationCard}>
            <Text style={styles.stationTitle}>King's Cross & St Pancras</Text>
            <View style={styles.stationRow}><Text style={styles.lineLabel}>Circle</Text><Text style={styles.timeText}>0 min</Text></View>
            <View style={styles.stationRow}><Text style={styles.lineLabel}>Northern</Text><Text style={styles.timeText}>0 min</Text></View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 },
  title: { fontSize: 28, fontWeight: '900', color: '#007AFF', letterSpacing: -0.5 },
  scrollContent: { paddingBottom: 40 },
  sectionHeader: { paddingHorizontal: 20, marginTop: 20, marginBottom: 8 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#1C1C1E' },
  emptyState: { alignItems: 'center', padding: 40, opacity: 0.5 },
  emptyText: { fontSize: 18, fontWeight: '600', marginBottom: 4, color: '#000' },
  emptySubText: { fontSize: 14, color: '#666' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', marginHorizontal: 20, marginBottom: 12, padding: 16, borderRadius: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, borderLeftWidth: 4 },
  cardContent: { flex: 1 },
  lineName: { fontSize: 18, fontWeight: '700', color: '#000', marginBottom: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusText: { fontSize: 14, fontWeight: '600', marginLeft: 4 },
  stationCard: { backgroundColor: 'white', marginHorizontal: 20, marginBottom: 12, padding: 16, borderRadius: 16 },
  stationTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8, color: '#000' },
  stationRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  lineLabel: { fontSize: 14, color: 'gray' },
  timeText: { fontSize: 14, fontWeight: '600', color: '#007AFF' }
});
