import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import Animated, {
  LinearTransition,
} from 'react-native-reanimated';

import { APP_CONFIG } from '../config/app.config';
import { LINE_COLORS, LINE_NAMES } from '../constants/lineColors';
import { resolveTflStopIds } from '../utils/resolveTflStopId';
import { normaliseLineId } from '../utils/normaliseLineId';
import { FULL_STATIONS, TFL_STATIONS } from '../data/tflStations';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { usePressAnimation } from '../hooks/usePressAnimation';
import { DashboardGradient } from '../components/DashboardGradient';
import { stationDataCache } from '../utils/stationCache';
import type { Severity } from '../components/MyCommuteDashboard';
import { playSound } from '../utils/sound';

const BACKEND_URL = APP_CONFIG.BACKEND_URL;

interface MappedDeparture {
  lineId: string;
  lineName: string;
  minutesAway: number;
  destination: string;
  platform: string;
  expectedArrival: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const getStatusPillColors = (severity: number | undefined) => {
  if (severity === undefined) {
    return {
      bg: 'rgba(156, 163, 175, 0.18)',
      border: 'rgba(156, 163, 175, 0.3)',
      text: '#9CA3AF',
    };
  }
  if (severity === 1) {
    return {
      bg: 'rgba(16, 185, 129, 0.18)',
      border: 'rgba(16, 185, 129, 0.3)',
      text: '#10B981',
    };
  } else if (severity >= 2 && severity < 9) {
    return {
      bg: 'rgba(255, 176, 32, 0.18)',
      border: 'rgba(255, 176, 32, 0.3)',
      text: '#FFB020',
    };
  } else if (severity === 20 || severity >= 9) {
    return {
      bg: 'rgba(209, 67, 67, 0.18)',
      border: 'rgba(209, 67, 67, 0.3)',
      text: '#D14343',
    };
  }
  return {
    bg: 'rgba(156, 163, 175, 0.18)',
    border: 'rgba(156, 163, 175, 0.3)',
    text: '#9CA3AF',
  };
};

const severityFromNumber = (n: number | undefined): Severity => {
  if (n === undefined) return 'unknown';
  if (n === 1) return 'good';
  if (n >= 2 && n <= 8) return 'minor';
  if (n === 20) return 'suspended';
  if (n >= 9) return 'severe';
  return 'unknown';
};

const getDepTimeStyle = (minutes: number | 'now') => {
  if (minutes === 0 || minutes === 'now') {
    return { color: '#30D158', fontFamily: 'SpaceGrotesk_700Bold', fontWeight: '700' as const };
  }
  if (typeof minutes === 'number' && minutes <= 2) {
    return { color: 'rgba(255,255,255,0.85)', fontWeight: '500' as const };
  }
  return { color: 'rgba(255,255,255,0.55)', fontWeight: '500' as const };
};

const cleanPlatformName = (platformRaw: string | null | undefined): string => {
  const raw = String(platformRaw ?? '').trim();
  if (!raw) return '';
  const match = raw.match(/Platform\s+[A-Za-z0-9]+/i);
  if (match) {
    return match[0].charAt(0).toUpperCase() + match[0].slice(1);
  }
  return raw;
};

const cleanStationName = (name: string) => {
  return String(name ?? '')
    .replace(/\s*(?:Underground Station|Elizabeth line Station|Overground Station|DLR Station|Rail Station|Station)$/i, '')
    .trim();
};

const getStationInfo = (id: string, name?: string) => {
  if (!id) return null;
  let found = TFL_STATIONS.find(s => s.id === id);
  if (found) return found;
  found = FULL_STATIONS.find(s => s.id === id);
  if (found) return found;
  if (name) {
    const cleanSearchName = name.toLowerCase().trim();
    found = FULL_STATIONS.find(s => s.name.toLowerCase().trim() === cleanSearchName);
    if (found) return found;
    found = TFL_STATIONS.find(s => s.name.toLowerCase().trim() === cleanSearchName);
    if (found) return found;
  }
  return null;
};

interface ViewLineButtonProps {
  lineId: string;
}

function ViewLineButton({ lineId }: ViewLineButtonProps) {
  const router = useRouter();
  const pressAnim = usePressAnimation('station_row');

  return (
    <Pressable
      style={styles.viewLineLink}
      onPressIn={pressAnim.onPressIn}
      onPressOut={pressAnim.onPressOut}
      onPress={async () => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await playSound('select', 0.45);
        router.push({
          pathname: '/(lineStack)/lineDetail',
          params: { lineId },
        });
      }}
    >
      <Animated.View style={pressAnim.animatedStyle}>
        <Text style={styles.viewLineLinkText}>View line →</Text>
      </Animated.View>
    </Pressable>
  );
}

export default function StationDetailScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const stationId = params.stationId as string;
  const rawStationName = params.stationName as string;
  const stationName = useMemo(() => cleanStationName(rawStationName), [rawStationName]);

  const lastKnownData = useUserPreferencesStore(s => s.lastKnownData || []);

  const [departures, setDepartures] = useState<MappedDeparture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailableLines, setUnavailableLines] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const backAnim = usePressAnimation('back_btn');
  const shareAnim = usePressAnimation('continue_btn');
  const retryAnim = usePressAnimation('continue_btn');

  // Resolve station metadata and serving lines
  const stationInfo = useMemo(() => {
    return getStationInfo(stationId, stationName);
  }, [stationId, stationName]);

  const servingLines = useMemo(() => {
    return stationInfo?.lines || [];
  }, [stationInfo]);

  // Fetch function handling multiple NaPTAN resolution
  const fetchStationDetail = useCallback(async (useCache: boolean = true) => {
    try {
      setLoading(true);
      setError(null);

      const resolvedIds = resolveTflStopIds(stationId);
      let allRawDepartures: any[] = [];
      let cacheSucceeded = false;
      const succeededNaPTANs = new Set<string>();
      const failedNaPTANs = new Set<string>();

      // 1. Check stationDataCache
      if (useCache) {
        let hasCacheData = false;
        for (const id of resolvedIds) {
          if (stationDataCache.has(id)) {
            try {
              const cachedData = await stationDataCache.get(id);
              if (cachedData && Array.isArray(cachedData.departures)) {
                allRawDepartures.push(...cachedData.departures);
                succeededNaPTANs.add(id);
                hasCacheData = true;
              }
              stationDataCache.delete(id);
            } catch {
              stationDataCache.delete(id);
            }
          }
        }
        if (hasCacheData) {
          cacheSucceeded = true;
        }
      }

      // 2. Fetch from network if cache missed or we forced fresh poll
      if (!cacheSucceeded) {
        const fetchPromises = resolvedIds.map(async (id) => {
          try {
            const res = await fetch(`${BACKEND_URL}/api/stations/${id}`);
            if (res.ok) {
              const data = await res.json();
              return { id, data, success: true };
            }
          } catch (e) {
            console.error(`Failed to fetch departures for NaPTAN ${id}:`, e);
          }
          return { id, data: null, success: false };
        });

        const results = await Promise.all(fetchPromises);
        results.forEach(result => {
          if (result.success && result.data) {
            succeededNaPTANs.add(result.id);
            if (Array.isArray(result.data.departures)) {
              allRawDepartures.push(...result.data.departures);
            }
          } else {
            failedNaPTANs.add(result.id);
          }
        });
      }

      // If all NaPTAN fetches failed and we have no cached data, trigger error
      if (succeededNaPTANs.size === 0 && resolvedIds.length > 0) {
        throw new Error('Departures feed unavailable');
      }

      // 3. Deduplicate
      const dedupedRaw: any[] = [];
      const seenKeys = new Set<string>();

      allRawDepartures.forEach(dep => {
        const dest = String(dep.destination || '');
        if (dest.includes('DELETE') || dest.includes('⚠️')) {
          return;
        }
        const key = `${dep.line}-${dep.platform || dep.destination}-${dep.expected_arrival}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          dedupedRaw.push(dep);
        }
      });

      // 4. Map departures to internal schema
      const mappedDepartures = dedupedRaw.map((dep: any) => {
        const { cleanLineId } = normaliseLineId(dep.line);
        return {
          lineId: cleanLineId,
          lineName: dep.line,
          minutesAway: dep.minutes_away || 0,
          destination: dep.destination || '',
          platform: dep.platform || '',
          expectedArrival: dep.expected_arrival || '',
        };
      });

      // 5. Determine unavailable lines
      const unavail = new Set<string>();
      failedNaPTANs.forEach(id => {
        const naptanInfo = FULL_STATIONS.find(s => s.id === id) || TFL_STATIONS.find(s => s.id === id);
        const lines = naptanInfo ? naptanInfo.lines : [];
        lines.forEach(lineId => {
          const isServedBySucceeded = Array.from(succeededNaPTANs).some(succId => {
            const succInfo = FULL_STATIONS.find(s => s.id === succId) || TFL_STATIONS.find(s => s.id === succId);
            return succInfo ? succInfo.lines.includes(lineId) : false;
          });
          if (!isServedBySucceeded) {
            unavail.add(lineId);
          }
        });
      });

      setDepartures(mappedDepartures);
      setUnavailableLines(unavail);
      setLoading(false);
    } catch (err: any) {
      console.log('Error fetching departures in stationDetail:', err);
      setError(err.message || 'Failed to load details');
      setLoading(false);
    }
  }, [stationId]);

  // Polling
  useEffect(() => {
    fetchStationDetail(true);
    const interval = setInterval(() => fetchStationDetail(false), 30000);
    return () => clearInterval(interval);
  }, [fetchStationDetail]);

  // Max severity calculation
  const stationSeverity = useMemo(() => {
    if (servingLines.length === 0 && departures.length === 0) return 'unknown';

    let maxSeverityVal = 1; // Default: Good Service
    const linesToCheck = new Set([...servingLines, ...departures.map(d => d.lineId)]);

    linesToCheck.forEach((lId) => {
      const lineData = lastKnownData?.find((l) => l.id === lId);
      const severityVal = lineData?.status_severity ?? 1;
      if (severityVal > maxSeverityVal) {
        maxSeverityVal = severityVal;
      }
    });

    return severityFromNumber(maxSeverityVal);
  }, [servingLines, departures, lastKnownData]);

  // Brand voice subhead text
  const { headerVoice } = useMemo(() => {
    const totalLinesCount = servingLines.length;
    if (totalLinesCount === 0) {
      return { headerVoice: 'Real-time departures', disruptedCount: 0 };
    }

    let disrupted = 0;
    servingLines.forEach((lId) => {
      const lineData = lastKnownData?.find((l) => l.id === lId);
      if (lineData && lineData.status_severity > 1) {
        disrupted++;
      }
    });

    if (disrupted > 0) {
      const lineLabel = totalLinesCount === 1 ? 'line' : 'lines';
      const voice = `${totalLinesCount} ${lineLabel} · ${disrupted} ${disrupted === 1 ? 'is' : 'are'} struggling.`;
      return { headerVoice: voice, disruptedCount: disrupted };
    } else {
      const lineLabel = totalLinesCount === 1 ? 'line' : 'lines';
      const voice = `${totalLinesCount} ${lineLabel} · All clear.`;
      return { headerVoice: voice, disruptedCount: 0 };
    }
  }, [servingLines, lastKnownData]);

  // Group departures by normalized line ID
  const groupedDepartures = useMemo(() => {
    const groups: Record<string, MappedDeparture[]> = {};
    departures.forEach((dep) => {
      if (!groups[dep.lineId]) {
        groups[dep.lineId] = [];
      }
      groups[dep.lineId].push(dep);
    });
    return groups;
  }, [departures]);

  // Merge serving lines and any active departures, keeping stable order
  const orderedLineIds = useMemo(() => {
    const list: string[] = [];
    servingLines.forEach((l) => {
      if (!list.includes(l)) list.push(l);
    });
    Object.keys(groupedDepartures).forEach((l) => {
      if (!list.includes(l)) list.push(l);
    });
    return list;
  }, [servingLines, groupedDepartures]);

  // Copy to clipboard
  const handleShare = async () => {
    if (departures.length === 0) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await playSound('select', 0.45);

    const summaryParts: string[] = [];
    const groupedDeps: Record<string, MappedDeparture[]> = {};
    departures.forEach(d => {
      if (!groupedDeps[d.lineName]) {
        groupedDeps[d.lineName] = [];
      }
      groupedDeps[d.lineName].push(d);
    });

    Object.entries(groupedDeps).forEach(([lineName, deps]) => {
      const sorted = deps.slice().sort((a, b) => a.minutesAway - b.minutesAway);
      const times = sorted.slice(0, 2).map(d => d.minutesAway === 0 ? 'now' : `${d.minutesAway}m`).join(', ');
      summaryParts.push(`${lineName}: ${times}`);
    });

    const prefix = `${stationName} departures: `;
    let text = prefix + summaryParts.join(' | ');
    if (text.length > 120) {
      text = text.slice(0, 117) + '...';
    }

    try {
      await Clipboard.setStringAsync(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.log('Clipboard copy failed:', e);
    }
  };

  const shareLabel = copied ? 'Copied!' : 'Share departures';

  // ─── Render States ─────────────────────────────────────────────────────────

  // 1. Loading State
  if (loading && departures.length === 0) {
    return (
      <View style={styles.root}>
        <DashboardGradient severity="unknown" />
        {/* Header */}
        <View style={styles.header}>
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={[styles.headerInner, { paddingTop: insets.top + 12 }]}>
            <Pressable
              style={styles.backButton}
              onPress={() => router.back()}
              onPressIn={backAnim.onPressIn}
              onPressOut={backAnim.onPressOut}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <Animated.View style={[styles.backIconContainer, backAnim.animatedStyle]}>
                <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
              </Animated.View>
            </Pressable>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitle} numberOfLines={1}>{stationName}</Text>
            </View>
          </View>
        </View>
        {/* Loading Indicator */}
        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" color="rgba(255, 255, 255, 0.4)" />
          <Text style={styles.loadingText}>Fetching departures...</Text>
        </View>
      </View>
    );
  }

  // 2. Failure State
  if (error && departures.length === 0) {
    return (
      <View style={styles.root}>
        <DashboardGradient severity="unknown" />
        {/* Header */}
        <View style={styles.header}>
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={[styles.headerInner, { paddingTop: insets.top + 12 }]}>
            <Pressable
              style={styles.backButton}
              onPress={() => router.back()}
              onPressIn={backAnim.onPressIn}
              onPressOut={backAnim.onPressOut}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <Animated.View style={[styles.backIconContainer, backAnim.animatedStyle]}>
                <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
              </Animated.View>
            </Pressable>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitle} numberOfLines={1}>{stationName}</Text>
            </View>
          </View>
        </View>
        {/* Failure Content */}
        <View style={styles.centeredContainer}>
          <Ionicons name="alert-circle" size={48} color="rgba(255, 255, 255, 0.3)" style={{ marginBottom: 16 }} />
          <Text style={styles.errorTitle}>Failed to load departures</Text>
          <Text style={styles.errorSubtext}>Departures are currently unavailable. Check your connection.</Text>
          <Pressable
            onPress={() => fetchStationDetail(false)}
            onPressIn={retryAnim.onPressIn}
            onPressOut={retryAnim.onPressOut}
            style={styles.retryButtonPressable}
          >
            <Animated.View style={[styles.retryButton, retryAnim.animatedStyle]}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </Animated.View>
          </Pressable>
        </View>
      </View>
    );
  }

  // 3. Normal Active State
  return (
    <View style={styles.root}>
      {/* Glow Ambient Layer */}
      <DashboardGradient severity={stationSeverity} />

      {/* Integrated Blur Header */}
      <View style={styles.header}>
        <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={[styles.headerInner, { paddingTop: insets.top + 12 }]}>
          <Pressable
            style={styles.backButton}
            onPress={() => router.back()}
            onPressIn={backAnim.onPressIn}
            onPressOut={backAnim.onPressOut}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Animated.View style={[styles.backIconContainer, backAnim.animatedStyle]}>
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </Animated.View>
          </Pressable>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {stationName}
            </Text>
            <View style={styles.headerMetadataRow}>
              <View style={styles.pipsContainer}>
                {servingLines.slice(0, 5).map((lId) => {
                  const color = LINE_COLORS[lId] || '#888';
                  return <View key={lId} style={[styles.pip, { backgroundColor: color }]} />;
                })}
                {servingLines.length > 5 && <Text style={styles.overflowDot}>·</Text>}
              </View>
              <Text style={styles.headerVoiceText} numberOfLines={1}>{headerVoice}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Main Content Area */}
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 68,
            paddingBottom: insets.bottom + 92,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {orderedLineIds.length === 0 ? (
          <View style={styles.emptyFeedCard}>
            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFillObject} />
            <Text style={styles.emptyFeedText}>No serving lines configured.</Text>
          </View>
        ) : (
          orderedLineIds.map((lineId) => {
            const isUnavailable = unavailableLines.has(lineId);
            const lineDeps = groupedDepartures[lineId] || [];
            const lineName = LINE_NAMES[lineId] || lineId;
            const lineColor = LINE_COLORS[lineId] || '#888';

            const lineInfo = lastKnownData?.find((l) => l.id === lineId);
            const severity = lineInfo?.status_severity ?? 1;
            const statusText = lineInfo?.status ?? 'Good Service';
            const isDisrupted = severity > 1;
            const statusPill = getStatusPillColors(isUnavailable ? undefined : severity);

            return (
              <Animated.View
                key={lineId}
                layout={LinearTransition.springify().mass(0.8).damping(18)}
                style={styles.cardContainer}
              >
                <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFillObject} />

                {/* Card Header */}
                <View style={styles.cardHeaderRow}>
                  <View style={[styles.lineAccentBar, { backgroundColor: lineColor }]} />
                  <Text style={styles.cardLineName}>{lineName}</Text>
                  
                  {isUnavailable ? (
                    <View style={styles.statusRow}>
                      <View style={[styles.statusDot, { backgroundColor: '#9CA3AF' }]} />
                      <Text style={styles.statusTextMuted}>Data unavailable</Text>
                    </View>
                  ) : (
                    <View style={[styles.statusPill, { backgroundColor: statusPill.bg, borderColor: statusPill.border }]}>
                      <Text style={[styles.statusPillText, { color: statusPill.text }]}>{statusText}</Text>
                    </View>
                  )}
                </View>

                {/* Inline Disruption block */}
                {!isUnavailable && isDisrupted && lineInfo?.reason && (
                  <View style={styles.disruptionTextContainer}>
                    <Text style={styles.disruptionReasonText}>{lineInfo.reason}</Text>
                    <ViewLineButton lineId={lineId} />
                  </View>
                )}

                {/* Card Body / Departures */}
                {isUnavailable ? (
                  <Text style={styles.emptyText}>Feed offline. Please try again later.</Text>
                ) : lineDeps.length === 0 ? (
                  <Text style={styles.emptyText}>No upcoming departures found.</Text>
                ) : (
                  <View style={styles.departuresList}>
                    {lineDeps.slice(0, 6).map((dep, index, arr) => {
                      const depVal = dep.minutesAway === 0 ? 'now' : dep.minutesAway;
                      const depTimeStyle = getDepTimeStyle(depVal);
                      const cleanPlatformText = cleanPlatformName(dep.platform);
                      const cleanDestText = dep.destination.replace(' Underground Station', '').replace(' DLR Station', '').trim();
                      const platformAndDest = cleanPlatformText ? `${cleanPlatformText} · to ${cleanDestText}` : `To ${cleanDestText}`;

                      return (
                        <View
                          key={`${dep.lineId}-${dep.destination}-${dep.minutesAway}-${index}`}
                          style={[
                            styles.departureRow,
                            index === arr.length - 1 && { borderBottomWidth: 0 },
                          ]}
                        >
                          <Text style={styles.platformAndDestText} numberOfLines={1}>
                            {platformAndDest}
                          </Text>
                          <Text style={[styles.departureTimeText, depTimeStyle]}>
                            {depVal === 'now' || depVal === 0 ? 'Due' : `${depVal} min`}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </Animated.View>
            );
          })
        )}
      </ScrollView>

      {/* Floating Share departures action pill */}
      {departures.length > 0 && (
        <View style={[styles.bottomPillContainer, { bottom: insets.bottom + 16 }]}>
          <Pressable
            onPress={handleShare}
            onPressIn={shareAnim.onPressIn}
            onPressOut={shareAnim.onPressOut}
            style={styles.pillPressable}
          >
            <Animated.View style={[styles.actionPill, shareAnim.animatedStyle]}>
              <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFillObject} />
              <Text style={styles.pillText}>{shareLabel}</Text>
            </Animated.View>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0B',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
    paddingHorizontal: 16,
    width: '100%',
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  backIconContainer: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: 8,
  },
  headerTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 20,
    color: '#FFFFFF',
  },
  headerMetadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  pipsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  pip: {
    width: 12,
    height: 3,
    borderRadius: 1.5,
    marginRight: 4,
  },
  overflowDot: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    lineHeight: 14,
    marginLeft: -2,
    marginRight: 6,
  },
  headerVoiceText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    flex: 1,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.4)',
    marginTop: 12,
  },
  errorTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 18,
    color: '#FFFFFF',
    marginBottom: 8,
  },
  errorSubtext: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  retryButtonPressable: {
    minWidth: 120,
  },
  retryButton: {
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  retryButtonText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 14,
    color: '#000000',
  },
  emptyFeedCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    overflow: 'hidden',
    padding: 24,
    alignItems: 'center',
  },
  emptyFeedText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  cardContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    overflow: 'hidden',
    marginBottom: 16,
    padding: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  lineAccentBar: {
    width: 4,
    height: 16,
    borderRadius: 2,
    marginRight: 8,
  },
  cardLineName: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
    flex: 1,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusPillText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusTextMuted: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 12,
    color: '#9CA3AF',
  },
  disruptionTextContainer: {
    backgroundColor: 'rgba(209, 67, 67, 0.08)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(209, 67, 67, 0.15)',
    padding: 10,
    marginBottom: 12,
  },
  disruptionReasonText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 16,
    marginBottom: 6,
  },
  viewLineLink: {
    alignSelf: 'flex-start',
  },
  viewLineLinkText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 12,
    color: '#30D158',
    textDecorationLine: 'underline',
  },
  departuresList: {
    marginTop: 4,
  },
  departureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  platformAndDestText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    flex: 1,
    marginRight: 12,
  },
  departureTimeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  emptyText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center',
    paddingVertical: 16,
  },
  bottomPillContainer: {
    position: 'absolute',
    left: 24,
    right: 24,
    zIndex: 100,
  },
  pillPressable: {
    width: '100%',
  },
  actionPill: {
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  pillText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 14,
    color: '#FFFFFF',
  },
});