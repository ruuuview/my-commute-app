import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { stationDataCache } from './index'; // Import the pre-fetch cache

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

interface Departure {
  destination: string;
  line: string;
  platform: string;
  minutes_away: number;
  expected_arrival: string;
  status?: string; // Line status for dynamic header
}

interface StationDetailData {
  id: string;
  name: string;
  departures: Departure[];
  updated_at: string;
}

// TfL Line Colors (official hex codes)
const getLineColor = (lineName: string): string => {
  const colors: { [key: string]: string } = {
    'Bakerloo': '#B36305',
    'Central': '#E32017',
    'Circle': '#FFD300',
    'District': '#00782A',
    'Hammersmith & City': '#F3A9BB',
    'Jubilee': '#A0A5A9',
    'Metropolitan': '#9B0056',
    'Northern': '#000000',
    'Piccadilly': '#003688',
    'Victoria': '#0098D4',
    'Waterloo & City': '#95CDBA',
    'Elizabeth': '#6950a1',
    'DLR': '#00AFAD',
  };
  
  // Handle line name variations
  const normalizedName = lineName.replace(' Line', '').trim();
  return colors[normalizedName] || colors[lineName] || '#666666';
};

// Extract platform number from platform string
const extractPlatformNumber = (platform: string): string => {
  const match = platform.match(/Platform (\d+)/);
  return match ? match[1] : platform.split(' ').pop() || '?';
};

// Determine text color based on background (for platform circles)
const getPlatformTextColor = (backgroundColor: string): string => {
  // Light backgrounds get black text, dark backgrounds get white text
  const lightColors = ['#FFD300', '#95CDBA', '#F3A9BB', '#00AFAD'];
  return lightColors.includes(backgroundColor) ? '#000' : '#fff';
};

// Format minutes to display text - Premium style with "MINS" suffix
const formatDueTime = (minutes: number): string => {
  if (minutes <= 0) return 'DUE';
  if (minutes === 1) return '1 MIN';
  return `${minutes} MINS`;
};

// Status severity levels for header color determination
const getStatusSeverity = (status: string): number => {
  const statusLower = status.toLowerCase();
  if (statusLower.includes('severe') || statusLower.includes('suspended') || statusLower.includes('closure')) {
    return 3; // Most severe - RED
  }
  if (statusLower.includes('minor') || statusLower.includes('delay') || statusLower.includes('disruption')) {
    return 2; // Moderate - AMBER/YELLOW
  }
  if (statusLower.includes('good') || statusLower.includes('service')) {
    return 1; // Good - GREEN
  }
  return 0; // Unknown/Default
};

// Dynamic header color based on most severe line status
const getHeaderColor = (departures: Departure[]): string => {
  if (!departures || departures.length === 0) return '#00A75D'; // Default green
  
  let maxSeverity = 1; // Default to good service
  
  departures.forEach(departure => {
    const status = departure.status || 'Good Service';
    const severity = getStatusSeverity(status);
    if (severity > maxSeverity) {
      maxSeverity = severity;
    }
  });
  
  switch (maxSeverity) {
    case 3: return '#E32017'; // RED - Severe delays/suspended
    case 2: return '#FFD700'; // YELLOW - Minor delays  
    case 1: return '#00A75D'; // GREEN - Good service
    default: return '#00A75D'; // Default green
  }
};

// Group departures by direction and sort chronologically by due time
const groupDeparturesByDirection = (departures: Departure[]) => {
  const northbound: Departure[] = [];
  const southbound: Departure[] = [];
  
  departures.forEach(departure => {
    const platform = departure.platform.toLowerCase();
    if (platform.includes('northbound') || platform.includes('eastbound')) {
      northbound.push(departure);
    } else if (platform.includes('southbound') || platform.includes('westbound')) {
      southbound.push(departure);
    } else {
      // Default to northbound if direction can't be determined
      northbound.push(departure);
    }
  });
  
  // Sort each direction chronologically by due time (earliest first)
  northbound.sort((a, b) => a.minutes_away - b.minutes_away);
  southbound.sort((a, b) => a.minutes_away - b.minutes_away);
  
  return { northbound, southbound };
};

export default function StationDetailScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const stationId = params.stationId as string;
  const stationName = params.stationName as string;

  const [stationData, setStationData] = useState<StationDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Clear old data when stationId changes to prevent flash of old content
    setStationData(null);
    setError(null);
    // Don't set loading=true here to avoid flash during navigation
    
    fetchStationDetail();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => fetchStationDetail(false), 30000); // Skip cache for auto-refresh
    return () => clearInterval(interval);
  }, [stationId]);

  const fetchStationDetail = async (useCache: boolean = true) => {
    try {
      setLoading(true); // Show loading indicator during refresh
      setError(null);
      
      // ⚡ PRE-FETCH: Check if we have cached data from dashboard
      if (useCache && stationDataCache.has(stationId)) {
        console.log(`⚡ CACHE HIT: Using pre-fetched data for ${stationId}`);
        
        try {
          // Await the cached promise
          const cachedPromise = stationDataCache.get(stationId);
          const data = await cachedPromise;
          
          console.log(`✅ CACHE DATA LOADED: ${data.name} with ${data.departures.length} trains`);
          setStationData(data);
          
          // Clear cache after use to prevent stale data
          stationDataCache.delete(stationId);
          console.log(`🧹 Cache cleared for ${stationId}`);
          
          setLoading(false);
          return;
        } catch (cacheError) {
          console.warn(`⚠️ Cache failed, falling back to fresh fetch:`, cacheError);
          // Clear bad cache entry
          stationDataCache.delete(stationId);
          // Continue to fresh fetch below
        }
      }
      
      // 🔴 LIVE API CALL - Fetch real-time station data from TfL (fresh fetch or cache miss)
      console.log(`🚇 FETCHING FRESH DATA for station: ${stationId}`);
      
      const response = await fetch(`${BACKEND_URL}/api/stations/${stationId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      console.log(`📥 Station API Response: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch station data: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`✅ LIVE DATA LOADED: ${data.name}`);
      console.log(`📊 Departures: ${data.departures.length} trains`);
      
      setStationData(data);
    } catch (error) {
      console.error('❌ Error fetching station detail:', error);
      setError(error instanceof Error ? error.message : 'Failed to load station details');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    router.back();
  };

  if (loading && !stationData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading departures...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !stationData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#E74C3C" />
          <Text style={styles.errorText}>Failed to load station departures</Text>
          <Text style={styles.errorSubtext}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchStationDetail}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { northbound, southbound } = stationData ? groupDeparturesByDirection(stationData.departures) : { northbound: [], southbound: [] };
  const currentTime = new Date().toLocaleTimeString('en-GB', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });

  // Determine dynamic header color based on most severe status
  const headerBackgroundColor = stationData ? getHeaderColor(stationData.departures) : '#00A75D';
  
  return (
    <SafeAreaView style={styles.container}>
      {/* Premium Dynamic Header with Status Color */}
      <View style={[styles.header, { backgroundColor: headerBackgroundColor }]}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        
        <View style={styles.headerContent}>
          <Text style={styles.stationTitle}>{(stationData?.name || stationName).toUpperCase()}</Text>
        </View>
        
        <TouchableOpacity style={styles.refreshButton} onPress={fetchStationDetail}>
          <Ionicons name="refresh" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Last Updated */}
        {stationData && (
          <View style={styles.lastUpdatedContainer}>
            <Text style={styles.lastUpdatedText}>
              Last updated: {(() => {
                try {
                  const date = new Date(stationData.updated_at);
                  if (isNaN(date.getTime())) {
                    return 'Just now';
                  }
                  return date.toLocaleTimeString('en-GB', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  });
                } catch (e) {
                  return 'Just now';
                }
              })()}
            </Text>
          </View>
        )}

        {/* Northbound / Eastbound */}
        {northbound.length > 0 && (
          <View style={styles.directionSection}>
            <Text style={styles.directionTitle}>↑ NORTHBOUND</Text>
            <View style={styles.departuresList}>
              {northbound.map((departure, index) => {
                const lineColor = getLineColor(departure.line);
                const platformNumber = extractPlatformNumber(departure.platform);
                const platformTextColor = getPlatformTextColor(lineColor);
                
                return (
                  <View key={`nb-${index}`} style={[styles.departureCard, { borderColor: lineColor }]}>
                    {/* Platform Circle with "PLT" prefix */}
                    <View style={[styles.platformCircle, { backgroundColor: lineColor }]}>
                      <Text style={[styles.platformLabel, { color: platformTextColor }]}>PLT</Text>
                      <Text style={[styles.platformNumber, { color: platformTextColor }]}>
                        {platformNumber}
                      </Text>
                    </View>
                    
                    {/* Details */}
                    <View style={styles.departureDetails}>
                      <Text style={[styles.lineName, { color: lineColor }]}>{departure.line}</Text>
                      <Text style={styles.destination}>{departure.destination.replace(' Underground Station', '').replace(' DLR Station', '')}</Text>
                    </View>
                    
                    {/* Due Time */}
                    <Text style={styles.dueTime}>{formatDueTime(departure.minutes_away)}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Southbound / Westbound */}
        {southbound.length > 0 && (
          <View style={styles.directionSection}>
            <Text style={styles.directionTitle}>↓ SOUTHBOUND</Text>
            <View style={styles.departuresList}>
              {southbound.map((departure, index) => {
                const lineColor = getLineColor(departure.line);
                const platformNumber = extractPlatformNumber(departure.platform);
                const platformTextColor = getPlatformTextColor(lineColor);
                
                return (
                  <View key={`sb-${index}`} style={[styles.departureCard, { borderColor: lineColor }]}>
                    {/* Platform Circle with "PLT" prefix */}
                    <View style={[styles.platformCircle, { backgroundColor: lineColor }]}>
                      <Text style={[styles.platformLabel, { color: platformTextColor }]}>PLT</Text>
                      <Text style={[styles.platformNumber, { color: platformTextColor }]}>
                        {platformNumber}
                      </Text>
                    </View>
                    
                    {/* Details */}
                    <View style={styles.departureDetails}>
                      <Text style={[styles.lineName, { color: lineColor }]}>{departure.line}</Text>
                      <Text style={styles.destination}>{departure.destination.replace(' Underground Station', '').replace(' DLR Station', '')}</Text>
                    </View>
                    
                    {/* Due Time */}
                    <Text style={styles.dueTime}>{formatDueTime(departure.minutes_away)}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* No Departures */}
        {(!stationData || stationData.departures.length === 0) && (
          <View style={styles.noDeparturesContainer}>
            <Ionicons name="train" size={48} color="#666" />
            <Text style={styles.noDeparturesText}>No departure information available</Text>
            <Text style={styles.noDeparturesSubtext}>
              Service may be suspended or station closed
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7', // Premium light grey background
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
    // Dynamic background color set inline
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
  },
  stationTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  currentTime: {
    fontSize: 14,
    color: '#FFFFFF',
  },
  refreshButton: {
    padding: 8,
  },
  content: {
    flex: 1,
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
    marginBottom: 8,
  },
  errorSubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
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
  lastUpdatedContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  lastUpdatedText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  directionSection: {
    marginTop: 20,
  },
  directionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 12,
    marginHorizontal: 16,
    letterSpacing: 0.5,
  },
  departuresList: {
    backgroundColor: 'transparent',
  },
  departureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 6,
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  platformCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  platformLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  platformNumber: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: -2,
  },
  departureDetails: {
    flex: 1,
  },
  lineName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  destination: {
    fontSize: 20,
    fontWeight: '800',
    color: '#000000',
  },
  dueTime: {
    fontSize: 22,
    fontWeight: '800',
    color: '#000000',
    minWidth: 90,
    textAlign: 'right',
  },
  noDeparturesContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  noDeparturesText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    textAlign: 'center',
  },
  noDeparturesSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
  },
});