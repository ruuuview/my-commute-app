// app/(tabs)/index.tsx
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import Animated, { useSharedValue, withTiming } from 'react-native-reanimated';
import { useUserPreferencesStore } from '../../store/userPreferencesStore';
import { useWorstStatus } from '../../hooks/useWorstStatus';
import { useLineDataStore } from '../../store/lineDataStore';
import LineCard from '../../components/LineCard';

const Dashboard = () => {
  const selectedLines = useUserPreferencesStore((state) => state.selectedLines);
  const { data, status } = useTflApi();

  // ─── REMOVE BEFORE SHIP — 5-state severity verification harness ──────────
  const worstStatus              = useWorstStatus(selectedLines);
  const incrementCommunityReport = useLineDataStore(s => s.incrementCommunityReport);
  const clearCommunityReports    = useLineDataStore(s => s.clearCommunityReports);
  const communityReports         = useLineDataStore(s => s.communityReports);

  const targetLine = selectedLines[0];  // operates on first selected line

  const forceMinor = () => {
    if (!targetLine) return;
    // 3 reports upgrades 'good' → 'minor' per §2.4
    clearCommunityReports(targetLine);
    incrementCommunityReport(targetLine);
    incrementCommunityReport(targetLine);
    incrementCommunityReport(targetLine);
  };

  const forceSevere = () => {
    if (!targetLine) return;
    // 5 reports upgrades 'minor' → 'severe' per §2.4
    clearCommunityReports(targetLine);
    for (let i = 0; i < 5; i++) incrementCommunityReport(targetLine);
  };

  const resetReports = () => {
    selectedLines.forEach(id => clearCommunityReports(id));
  };

  const reportCount = targetLine ? (communityReports[targetLine] ?? 0) : 0;
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <ScrollView style={styles.container}>

      {/* ── REMOVE BEFORE SHIP — verification overlay ── */}
      <View style={styles.debugPanel}>
        <Text style={styles.debugText}>
          worstStatus: <Text style={styles.debugValue}>{worstStatus}</Text>
        </Text>
        <Text style={styles.debugText}>
          line[0]: {targetLine ?? 'none'} · reports: {reportCount}
        </Text>
        <View style={styles.debugButtons}>
          <Pressable style={[styles.debugBtn, styles.btnMinor]} onPress={forceMinor}>
            <Text style={styles.debugBtnText}>Force minor</Text>
          </Pressable>
          <Pressable style={[styles.debugBtn, styles.btnSevere]} onPress={forceSevere}>
            <Text style={styles.debugBtnText}>Force severe</Text>
          </Pressable>
          <Pressable style={[styles.debugBtn, styles.btnReset]} onPress={resetReports}>
            <Text style={styles.debugBtnText}>Reset</Text>
          </Pressable>
        </View>
        <Text style={styles.debugHint}>
          5-state checklist:{'\n'}
          □ unknown  (airplane mode, cold launch){'\n'}
          □ good     (all lines clear){'\n'}
          □ minor    (force minor btn or live delay){'\n'}
          □ severe   (force severe btn or live delay){'\n'}
          □ suspended (select suspended line on TfL board){'\n'}
          □ crossfade smooth (not a snap)
        </Text>
      </View>
      {/* ────────────────────────────────────────────── */}

      {selectedLines.length === 0 ? (
        <View style={styles.zeroState}>
          <Text style={styles.title}>Your commute is a blank slate.</Text>
          <Pressable style={styles.ctaButton} onPress={() => {}}>
            <Text style={styles.ctaButtonText}>Add Your First Line</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {selectedLines.map((lineId) => (
            <LineCard key={lineId} lineId={lineId} />
          ))}
        </>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
    paddingTop: 60,
  },

  // ── REMOVE BEFORE SHIP — debug panel styles ────────────────────────────
  debugPanel: {
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    zIndex: 999,
  },
  debugText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'Courier',
    marginBottom: 2,
  },
  debugValue: {
    color: '#FFD329',
    fontFamily: 'Courier',
    fontWeight: '700',
  },
  debugButtons: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    marginBottom: 8,
  },
  debugBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  btnMinor: { backgroundColor: '#7C3A00' },
  btnSevere: { backgroundColor: '#5C0A0A' },
  btnReset: { backgroundColor: 'rgba(255,255,255,0.15)' },
  debugBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'Courier',
  },
  debugHint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    fontFamily: 'Courier',
    lineHeight: 16,
    marginTop: 4,
  },
  // ────────────────────────────────────────────────────────────────────────

  zeroState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 30,
  },
  ctaButton: {
    backgroundColor: '#388E3C',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default Dashboard;
