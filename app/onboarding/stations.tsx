// app/onboarding/stations.tsx — Screen 2: Station Search (v4.1 §4.3 + §17.5)

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput,
  Modal, Pressable, useWindowDimensions, KeyboardAvoidingView, Platform,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeInDown, FadeInUp, SlideInDown } from 'react-native-reanimated';
import Fuse from 'fuse.js';
import * as Haptics from 'expo-haptics';
import {
  useFonts, SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useUserPreferencesStore } from '../../store/userPreferencesStore';
import { POPULAR_STATIONS, TfLStation, FULL_STATIONS } from '../../data/tflStations';
import VoidBackground from '../../components/VoidBackground';
import BouncyPressable from '../../components/BouncyPressable';
import ProgressDots from '../../components/ProgressDots';

// ─── Line colour map for dots in search results ───────────────────────────────
const LINE_COLORS: Record<string, string> = {
  bakerloo: '#B36305', central: '#E32017', circle: '#FFD300',
  district: '#00782A', dlr: '#00AFAD', elizabeth: '#6950A1',
  'hammersmith-city': '#F3A9BB', jubilee: '#A0A5A9', metropolitan: '#9B0056',
  northern: '#3A3A3C', overground: '#EE7C0E', piccadilly: '#003688',
  victoria: '#0098D4', 'waterloo-city': '#95CDBA',
};

const MAX_PINS = 5;
const ROW_HEIGHT = 64;

// ─── Line dots row ────────────────────────────────────────────────────────────
function LineDots({ lines }: { lines: string[] }) {
  const shown = lines.slice(0, 4);
  const extra = lines.length - 4;
  return (
    <View style={styles.lineDotsContainer}>
      {shown.map(l => (
        <View
          key={l}
          style={{
            width: 10, height: 10, borderRadius: 5,
            backgroundColor: LINE_COLORS[l] ?? '#888',
            borderWidth: l === 'northern' || l === 'circle' ? 0.5 : 0,
            borderColor: 'rgba(255,255,255,0.4)',
          }}
        />
      ))}
      {extra > 0 && (
        <Text style={styles.lineDotsExtra}>
          +{extra}
        </Text>
      )}
    </View>
  );
}

// ─── Search result row — fixed 64pt height for FlatList performance ───────────
const StationRow = React.memo(function StationRow({
  station,
  isPinned,
  onTap,
}: {
  station: TfLStation;
  isPinned: boolean;
  onTap: (s: TfLStation) => void;
}) {
  return (
    <BouncyPressable
      onPress={() => onTap(station)}
      disabled={isPinned}
      style={[styles.row, isPinned && { opacity: 0.45 }]}
      accessibilityRole="button"
      accessibilityLabel={`${station.name}, Zone ${station.zone}${isPinned ? ', already added' : ''}`}
    >
      <View style={styles.flex1}>
        <Text style={styles.rowName} numberOfLines={1}>{station.name}</Text>
        <View style={styles.stationRowZoneContainer}>
          {station.zone !== undefined && <Text style={styles.rowZone}>Zone {station.zone}</Text>}
          <LineDots lines={station.lines} />
        </View>
      </View>
      {isPinned
        ? <Ionicons name="checkmark-circle" size={20} color="rgba(255,255,255,0.60)" />
        : <Ionicons name="add-circle-outline" size={20} color="rgba(255,255,255,0.40)" />
      }
    </BouncyPressable>
  );
});

// ─── Role selection bottom sheet ──────────────────────────────────────────────
type Role = 'home' | 'work' | 'other';

function RoleSheet({
  station,
  visible,
  onConfirm,
  onDismiss,
}: {
  station: TfLStation | null;
  visible: boolean;
  onConfirm: (role: Role) => void;
  onDismiss: () => void;
}) {
  const [role, setRole] = useState<Role | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => { if (!visible) setRole(null); }, [visible]);

  const ROLES: { id: Role; label: string; icon: string }[] = [
    { id: 'home',  label: 'Home',  icon: 'home-outline' },
    { id: 'work',  label: 'Work',  icon: 'briefcase-outline' },
    { id: 'other', label: 'Other', icon: 'location-outline' },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss} accessibilityViewIsModal>
      <Pressable style={styles.sheetScrim} onPress={onDismiss} />
      <Animated.View entering={SlideInDown} style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        {/* Drag handle */}
        <View style={styles.sheetHandle} />

        <Text style={styles.sheetTitle}>
          How do you use{'\n'}
          <Text style={styles.sheetStationName}>{station?.name}?</Text>
        </Text>

        <View style={styles.roleRow}>
          {ROLES.map(r => (
            <BouncyPressable
              key={r.id}
              onPress={async () => {
                await Haptics.selectionAsync();
                setRole(r.id);
              }}
              style={[styles.roleBtn, role === r.id && styles.roleBtnSelected]}
              accessibilityRole="button"
              accessibilityState={{ selected: role === r.id }}
              accessibilityLabel={r.label}
            >
              <Ionicons name={r.icon as any} size={22} color="rgba(255,255,255,0.90)" />
              <Text style={styles.roleBtnText}>{r.label}</Text>
            </BouncyPressable>
          ))}
        </View>

        <BouncyPressable
          onPress={async () => {
            if (!role) return;
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onConfirm(role);
          }}
          disabled={!role}
          style={[styles.sheetCta, !role && { opacity: 0.35 }]}
          accessibilityRole="button"
          accessibilityLabel="Confirm station"
        >
          <Text style={styles.sheetCtaText}>Add {station?.name}</Text>
        </BouncyPressable>
      </Animated.View>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function StationsScreen() {
  const { push }     = useRouter();
  const insets       = useSafeAreaInsets();
  const pinnedStations = useUserPreferencesStore(s => s.pinnedStations);
  const pinStation     = useUserPreferencesStore(s => s.pinStation);

  const [query, setQuery]             = useState('');
  const [sheetStation, setSheetStation] = useState<TfLStation | null>(null);
  const inputRef = useRef<TextInput>(null);

  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold,
  });

  const isAtLimit = pinnedStations.length >= MAX_PINS;
  const canContinue = pinnedStations.length > 0;

  // Search results — memoised with dynamic threshold formula
  const results = useMemo<TfLStation[]>(() => {
    if (!query.trim()) return POPULAR_STATIONS;
    
    // Adaptive threshold: Math.max(0.2, 0.5 - query.length * 0.05)
    // Ensures long words like "Paddington" require strict matching
    const dynamicThreshold = Math.max(0.2, 0.5 - query.length * 0.05);
    
    const fuse = new Fuse(FULL_STATIONS, {
      keys: ['name'],
      threshold: dynamicThreshold,
      includeScore: true,
    });
    
    return fuse.search(query).map(r => r.item);
  }, [query]);

  const handleRowTap = useCallback((station: TfLStation) => {
    const alreadyPinned = pinnedStations.some(p => p.id === station.id);
    if (alreadyPinned || isAtLimit) return;
    Haptics.selectionAsync();
    setSheetStation(station);
  }, [pinnedStations, isAtLimit]);

  const handleConfirm = useCallback((role: Role) => {
    if (!sheetStation) return;
    pinStation(sheetStation, role);
    setSheetStation(null);
  }, [sheetStation, pinStation]);

  const pinnedIds = useMemo(() => new Set(pinnedStations.map(p => p.id)), [pinnedStations]);

  const renderItem = useCallback(({ item }: { item: TfLStation }) => (
    <StationRow
      station={item}
      isPinned={pinnedIds.has(item.id)}
      onTap={handleRowTap}
    />
  ), [pinnedIds, handleRowTap]);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index,
  }), []);

  return (
    <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.root, { backgroundColor: '#1A1A2E' }]}>
        <VoidBackground />
        <Stack.Screen options={{ headerShown: false }} />

        {/* Progress dots */}
        <ProgressDots currentStep={1} totalSteps={3} style={{ paddingTop: insets.top + 16 }} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={2} allowFontScaling maxFontSizeMultiplier={1.3}>
            {'Which stations\ndo you use?'}
          </Text>
        </View>

        {pinnedStations.length > 0 && (
          <Animated.View entering={FadeInDown} style={styles.pillStrip}>
            {pinnedStations.map((s, index) => (
              <View key={s.id} style={styles.selectedPill}>
                <Text style={styles.selectedPillText} numberOfLines={1}>{s.name}</Text>
              </View>
            ))}
          </Animated.View>
        )}

        {/* Search bar */}
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={16} color="rgba(255,255,255,0.50)" style={styles.searchIcon} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Search 90+ London stations"
            placeholderTextColor="rgba(255,255,255,0.35)"
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            style={styles.searchInput}
            accessibilityLabel="Search London stations"
            accessibilityRole="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.50)" style={styles.clearIcon} />
            </Pressable>
          )}
        </View>

        {/* Section label */}
        <Text style={styles.sectionLabel}>
          {query ? `${results.length} result${results.length !== 1 ? 's' : ''}` : 'Popular stations'}
        </Text>

        {/* Results list — utilizing FlashList for 60fps 471-item performance */}
        <View style={{ flex: 1, width: '100%' }}>
          <FlashList
            data={results}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            estimatedItemSize={ROW_HEIGHT}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={28} color="rgba(255,255,255,0.25)" />
                <Text style={styles.emptyText}>No stations found for "{query}"</Text>
                <Text style={styles.emptyHint}>Try a different spelling or nearby station</Text>
              </View>
            }
          />
        </View>

        {/* Sticky Continue CTA */}
        <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + 16 }]}>
          <BouncyPressable
            onPress={async () => {
              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              push('/onboarding/permissions');
            }}
            disabled={!canContinue}
            accessibilityRole="button"
            accessibilityLabel={canContinue ? 'Continue' : 'Add at least one station to continue'}
            accessibilityState={{ disabled: !canContinue }}
            style={[styles.cta, { backgroundColor: canContinue ? '#FFFFFF' : 'rgba(255,255,255,0.12)' }]}
          >
            <Text style={[styles.ctaText, { color: canContinue ? '#0A0A0F' : 'rgba(255,255,255,0.35)' }]}>
              Continue
            </Text>
          </BouncyPressable>
        </View>

        {/* Role selection bottom sheet */}
        <RoleSheet
          station={sheetStation}
          visible={!!sheetStation}
          onConfirm={handleConfirm}
          onDismiss={() => setSheetStation(null)}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  title: {
    fontSize: 32,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: 'rgba(255,255,255,0.95)',
    letterSpacing: -0.5,
    lineHeight: 38,
  },
  lineDotsContainer: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lineDotsExtra: { color: 'rgba(255,255,255,0.50)', fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular' },
  flex1: { flex: 1 },
  stationRowZoneContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  sheetStationName: { color: 'rgba(255,255,255,0.95)' },
  searchIcon: { marginLeft: 14 },
  clearIcon: { marginRight: 12 },

  // Selected pill strip
  pillStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  selectedPill: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.40)',
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  selectedPillText: {
    fontSize: 13,
    fontFamily: 'SpaceGrotesk_500Medium',
    color: 'rgba(255,255,255,0.90)',
  },

  // Search bar — glass-bg-input per §1.1
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
    borderRadius: 14,
    height: 48,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 10,
    height: '100%',
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255,255,255,0.40)',
    paddingHorizontal: 16,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // Result row — fixed 64pt
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  rowName: {
    fontSize: 15,
    fontFamily: 'SpaceGrotesk_500Medium',
    color: 'rgba(255,255,255,0.95)',
  },
  rowZone: {
    fontSize: 12,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255,255,255,0.50)',
  },

  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 48, gap: 8 },
  emptyText: { fontSize: 15, fontFamily: 'SpaceGrotesk_500Medium', color: 'rgba(255,255,255,0.50)', textAlign: 'center' },
  emptyHint: { fontSize: 13, fontFamily: 'SpaceGrotesk_400Regular', color: 'rgba(255,255,255,0.30)', textAlign: 'center' },

  // Sticky CTA
  ctaWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: 'rgba(13,11,23,0.92)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  cta: { height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 16, fontFamily: 'SpaceGrotesk_700Bold' },

  // Role sheet
  sheetScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: '#16162A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 22,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: 'rgba(255,255,255,0.60)',
    marginBottom: 24,
  },
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  roleBtn: {
    flex: 1, height: 72, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  roleBtnSelected: {
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderColor: 'rgba(255,255,255,0.70)',
  },
  roleBtnText: {
    fontSize: 13, fontFamily: 'SpaceGrotesk_500Medium',
    color: 'rgba(255,255,255,0.90)',
  },
  sheetCta: {
    height: 56, borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  sheetCtaText: {
    fontSize: 16, fontFamily: 'SpaceGrotesk_700Bold', color: '#0A0A0F',
  },
});
