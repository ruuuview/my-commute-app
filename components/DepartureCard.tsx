import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, Text, Pressable, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

// ─── Constants & Styling Tokens ──────────────────────────────────────────────
const TEXT_PRIMARY   = 'rgba(255,255,255,0.9)';
const TEXT_SECONDARY = 'rgba(255,255,255,0.4)';
const TEXT_GHOST     = 'rgba(255,255,255,0.3)';
const AMBER_COLOR    = '#F2A002'; // Locked amber token

const TFL_COLORS: Record<string, string> = {
  bakerloo: '#B36305', central: '#E32017', circle: '#FFD300', district: '#00782A',
  'hammersmith-city': '#F3A9BB', jubilee: '#A0A5A9', metropolitan: '#9B0056',
  northern: '#1A1A1A', piccadilly: '#003688', victoria: '#0098D4', 'waterloo-city': '#95CDBA',
  elizabeth: '#6950A1', overground: '#EE7C0E', dlr: '#00A4A7',
};

// ─── Interfaces ──────────────────────────────────────────────────────────────
interface Arrival {
  lineId: string;
  lineName: string;
  lineColor: string;
  minutesAway: number;
  destination: string;
  expectedArrival: string;
}

interface DepartureCardProps {
  stationId: string;
  stationName: string;
  role?: 'home' | 'work' | 'other';
  isEditing?: boolean;
  onDelete?: (id: string) => void;
  onLongPress?: () => void;
}

const getDepTimeStyle = (minutes: number | 'now') => {
  if (minutes === 'now') return { color: '#FFFFFF', fontWeight: '700' as const };
  if (minutes <= 3) return { color: AMBER_COLOR, fontWeight: '600' as const };
  return { color: 'rgba(255,255,255,0.75)', fontWeight: '400' as const };
};

export default function DepartureCard({
  stationId,
  stationName,
  role,
  isEditing = false,
  onDelete,
  onLongPress,
}: DepartureCardProps) {
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch arrivals for this station
  const fetchArrivals = useCallback(async () => {
    try {
      const res = await fetch(`https://my-commute-backend.vercel.app/api/stations/${stationId}`);
      if (!res.ok) return;

      const sData = await res.json();
      const mappedArrivals = (sData.departures || []).map((dep: any) => {
        const lineKey = String(dep.line || '').toLowerCase().replace(' line', '').trim();
        return {
          lineId: lineKey,
          lineName: dep.line,
          lineColor: TFL_COLORS[lineKey] || '#888',
          minutesAway: dep.minutes_away,
          destination: String(dep.destination || '').replace(' Underground Station', '').replace(' DLR Station', ''),
          expectedArrival: dep.expected_arrival,
        };
      });

      setArrivals(mappedArrivals);
      setLoading(false);
    } catch (err) {
      console.log('Error fetching in DepartureCard:', err);
    }
  }, [stationId]);

  useEffect(() => {
    fetchArrivals();
    // Poll arrivals every 30 seconds
    const interval = setInterval(fetchArrivals, 30000);
    return () => clearInterval(interval);
  }, [fetchArrivals]);

  // Format clean station name
  const cleanName = String(stationName ?? '')
    .replace(/\s*(?:Underground Station|Elizabeth line Station|Overground Station|DLR Station|Rail Station|Station)$/i, '')
    .trim();

  return (
    <Pressable
      onLongPress={onLongPress}
      style={styles.container}
    >
      <View style={styles.header}>
        <View style={styles.uBadge}>
          <Text style={styles.uText}>U</Text>
        </View>
        <View style={styles.titleColumn}>
          <Text style={styles.stationName} numberOfLines={1}>
            {cleanName}
          </Text>
          {role && (
            <Text style={styles.roleBadge}>
              {role.toUpperCase()} STATION
            </Text>
          )}
        </View>

        {isEditing && onDelete && (
          <Pressable
            style={styles.deleteBadge}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onDelete(stationId);
            }}
          >
            <Text style={styles.deleteIcon}>−</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.arrivalsContainer}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
            <Text style={styles.loadingText}>Fetching departures...</Text>
          </View>
        ) : arrivals.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No upcoming departures found</Text>
          </View>
        ) : (
          arrivals.slice(0, 3).map((a, i) => {
            const depVal = a.minutesAway === 0 ? 'now' : a.minutesAway;
            const depStyle = getDepTimeStyle(depVal);
            return (
              <View
                key={`${a.lineId}-${a.destination}-${a.minutesAway}-${i}`}
                style={styles.arrivalRow}
              >
                <View style={[styles.arrivalDot, { backgroundColor: a.lineColor }]} />
                <Text style={styles.arrivalLineName} numberOfLines={1} ellipsizeMode="tail">
                  {a.lineName}
                </Text>
                <Text style={styles.arrivalDest} numberOfLines={1}>
                  {a.destination}
                </Text>
                <Text style={[styles.arrivalTime, depStyle]}>
                  {depVal === 'now' ? 'Due' : `${depVal} min`}
                </Text>
              </View>
            );
          })
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    overflow: 'visible',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  uBadge: {
    width: 20,
    height: 20,
    borderRadius: 3,
    backgroundColor: '#003688',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  uText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 11,
    color: '#FFF',
  },
  titleColumn: {
    flex: 1,
  },
  stationName: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 15,
    color: '#FFFFFF',
  },
  roleBadge: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 8,
    color: TEXT_SECONDARY,
    marginTop: 2,
    letterSpacing: 0.8,
  },
  arrivalsContainer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  loadingText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: TEXT_SECONDARY,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  emptyText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: TEXT_GHOST,
  },
  arrivalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    gap: 8,
  },
  arrivalDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  arrivalLineName: {
    width: 72,
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  arrivalDest: {
    flex: 1,
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
  },
  arrivalTime: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: '#FFFFFF',
    textAlign: 'right',
  },
  deleteBadge: {
    position: 'absolute',
    top: -6,
    left: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#1E1E1E',
  },
  deleteIcon: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: -2,
  },
});
