import { APP_CONFIG } from '../config/app.config';
import React, { useEffect, useReducer, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Pressable, 
  ScrollView, 
  ActivityIndicator, 
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { stationDataCache } from '../utils/stationCache'; // ✅ Fixed Circular Dependency

const BACKEND_URL = APP_CONFIG.BACKEND_URL;

interface Departure { destination: string; line: string; platform: string; minutes_away: number; expected_arrival: string; status?: string; }
interface StationDetailData { id: string; name: string; departures: Departure[]; updated_at: string; }

const getLineColor = (lineName: string | null | undefined): string => {
  const colors: { [key: string]: string } = {
    'Bakerloo': '#B36305', 'Central': '#E32017', 'Circle': '#FFD300', 'District': '#00782A',
    'Hammersmith & City': '#F3A9BB', 'Jubilee': '#C8CDD1', 'Metropolitan': '#9B0056', 'Northern': '#000000',
    'Piccadilly': '#003688', 'Victoria': '#0098D4', 'Waterloo & City': '#95CDBA', 'Elizabeth': '#6950a1', 'DLR': '#00AFAD',
  };
  const lineNameStr = String(lineName ?? '');
  const normalizedName = lineNameStr.replace(' Line', '').trim();
  return colors[normalizedName] || colors[lineNameStr] || '#666666';
};

const extractPlatformNumber = (platform: string | null | undefined): string => {
  const platformStr = String(platform ?? '');
  const match = platformStr.match(/Platform (\d+)/);
  return match ? match[1] : platformStr.split(' ').pop() || '?';
};

const getPlatformTextColor = (backgroundColor: string): string => {
  const lightColors = ['#FFD300', '#95CDBA', '#F3A9BB', '#00AFAD'];
  return lightColors.includes(backgroundColor) ? '#000' : '#fff';
};

const formatDueTime = (minutes: number): string => {
  if (minutes <= 0) return 'DUE';
  if (minutes === 1) return '1 MIN';
  return `${minutes} MINS`;
};

const getStatusSeverity = (status: string | null | undefined): number => {
  const statusLower = String(status ?? '').toLowerCase();
  if (statusLower.includes('severe') || statusLower.includes('suspended') || statusLower.includes('closure')) return 3; 
  if (statusLower.includes('minor') || statusLower.includes('delay') || statusLower.includes('disruption')) return 2; 
  if (statusLower.includes('good') || statusLower.includes('service')) return 1; 
  return 0; 
};

const getHeaderColor = (departures: Departure[]): string => {
  if (!departures || departures.length === 0) return '#00A75D'; 
  let maxSeverity = 1; 
  departures.forEach(d => {
    const severity = getStatusSeverity(d.status || 'Good Service');
    if (severity > maxSeverity) maxSeverity = severity;
  });
  switch (maxSeverity) { case 3: return '#E32017'; case 2: return '#FFD700'; case 1: return '#00A75D'; default: return '#00A75D'; }
};

const groupDeparturesByDirection = (departures: Departure[]) => {
  const northbound: Departure[] = [];
  const southbound: Departure[] = [];
  departures.forEach(d => {
    const platform = String(d.platform ?? '').toLowerCase();
    if (platform.includes('northbound') || platform.includes('eastbound')) northbound.push(d);
    else if (platform.includes('southbound') || platform.includes('westbound')) southbound.push(d);
    else northbound.push(d);
  });
  northbound.sort((a, b) => a.minutes_away - b.minutes_away);
  southbound.sort((a, b) => a.minutes_away - b.minutes_away);
  return { northbound, southbound };
};

export default function StationDetailScreen() {
  const params = useLocalSearchParams();
  const { back } = useRouter();
  const stationId = params.stationId as string;
  const stationName = params.stationName as string;
  const insets = useSafeAreaInsets();

  const [{ stationData, loading, error }, dispatch] = useReducer(
    (state: { stationData: StationDetailData | null, loading: boolean, error: string | null }, action: Partial<{ stationData: StationDetailData | null, loading: boolean, error: string | null }>) => ({ ...state, ...action }),
    { stationData: null, loading: true, error: null }
  );

  const fetchStationDetail = useCallback(async (useCache: boolean = true) => {
    try {
      dispatch({ loading: true, error: null });
      if (useCache && stationDataCache.has(stationId)) {
        try {
          const data = await stationDataCache.get(stationId);
          dispatch({ stationData: data, loading: false });
          stationDataCache.delete(stationId);
          return;
        } catch { stationDataCache.delete(stationId); }
      }
      
      const response = await fetch(`${BACKEND_URL}/api/stations/${stationId}`);
      if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
      const data = await response.json();
      dispatch({ stationData: data });
    } catch (e: any) {
      dispatch({ error: e.message || 'Failed to load details' });
    } finally {
      dispatch({ loading: false });
    }
  }, [stationId]);

  useEffect(() => {
    dispatch({ stationData: null, error: null, loading: true });
    fetchStationDetail();
    const interval = setInterval(() => fetchStationDetail(false), 30000); 
    return () => clearInterval(interval);
  }, [stationId, fetchStationDetail]);

  if (loading && !stationData) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading departures…</Text>
        </View>
      </View>
    );
  }

  if (error && !stationData) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#E74C3C" />
          <Text style={styles.errorText}>Failed to load departures</Text>
          <Pressable style={styles.retryButton} onPress={() => fetchStationDetail()} accessibilityLabel="Retry loading departures" accessibilityRole="button">
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const { northbound, southbound } = stationData ? groupDeparturesByDirection(stationData.departures) : { northbound: [], southbound: [] };
  const headerBackgroundColor = stationData ? getHeaderColor(stationData.departures) : '#00A75D';
  
  const renderDepartureBlock = (departure: Departure, index: number, prefix: string) => {
    const lineColor = getLineColor(departure.line);
    const platformNumber = extractPlatformNumber(departure.platform);
    const platformTextColor = getPlatformTextColor(lineColor);
    return (
      <View key={`${prefix}-${departure.line}-${departure.destination}-${departure.minutes_away}-${departure.expected_arrival || 'fallback'}`} style={[styles.departureCard, { borderColor: lineColor }]}>
        <View style={[styles.platformCircle, { backgroundColor: lineColor }]}>
          <Text style={[styles.platformLabel, { color: platformTextColor }]}>PLT</Text>
          <Text style={[styles.platformNumber, { color: platformTextColor }]}>{platformNumber}</Text>
        </View>
        <View style={styles.departureDetails}>
          <Text style={[styles.lineName, { color: lineColor }]}>{String(departure.line ?? '')}</Text>
          <Text style={styles.destination} numberOfLines={1}>{String(departure.destination ?? '').replace(' Underground Station', '').replace(' DLR Station', '')}</Text>
        </View>
        <Text style={styles.dueTime}>{formatDueTime(departure.minutes_away)}</Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: headerBackgroundColor }]}>
        <Pressable style={styles.backButton} onPress={() => back()} accessibilityLabel="Go back" accessibilityRole="button"><Ionicons name="arrow-back" size={28} color="#FFFFFF" /></Pressable>
        <View style={styles.headerContent}><Text style={styles.stationTitle}>{String(stationData?.name ?? stationName ?? '').toUpperCase()}</Text></View>
        <Pressable style={styles.refreshButton} onPress={() => fetchStationDetail()} accessibilityLabel="Refresh departures" accessibilityRole="button"><Ionicons name="refresh" size={24} color="#FFFFFF" /></Pressable>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic">
        {northbound.length > 0 && (
          <View style={styles.directionSection}>
            <Text style={styles.directionTitle}>↑ NORTHBOUND</Text>
            {northbound.map((d, i) => renderDepartureBlock(d, i, 'nb'))}
          </View>
        )}
        {southbound.length > 0 && (
          <View style={styles.directionSection}>
            <Text style={styles.directionTitle}>↓ SOUTHBOUND</Text>
            {southbound.map((d, i) => renderDepartureBlock(d, i, 'sb'))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F7' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 20 },
  backButton: { padding: 8, marginRight: 8 },
  headerContent: { flex: 1, alignItems: 'center' },
  stationTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', letterSpacing: 1.5, textAlign: 'center' },
  refreshButton: { padding: 8 },
  content: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 16, fontSize: 16, color: '#666' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: { fontSize: 18, color: '#E74C3C', textAlign: 'center', marginTop: 16, marginBottom: 24 },
  retryButton: { backgroundColor: '#007AFF', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  retryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  directionSection: { marginTop: 20 },
  directionTitle: { fontSize: 15, fontWeight: '600', color: '#666666', marginBottom: 12, marginHorizontal: 16, letterSpacing: 0.5 },
  departureCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 6, paddingHorizontal: 16, paddingVertical: 18, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 3, boxShadow: '0 2px 4px rgba(0,0,0,0.08)' },
  platformCircle: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  platformLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  platformNumber: { fontSize: 16, fontWeight: '700', marginTop: -2 },
  departureDetails: { flex: 1 },
  lineName: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  destination: { fontSize: 20, fontWeight: '800', color: '#000000' },
  dueTime: { fontSize: 22, fontWeight: '800', color: '#000000', minWidth: 90, textAlign: 'right' }
});