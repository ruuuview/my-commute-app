// components/refunds/ClaimHistoryDrawer.tsx
import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Dimensions,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import {
  X,
  Receipt,
  CheckCircle,
  Clock,
  WarningCircle,
  XCircle,
} from 'phosphor-react-native';
import { GLASS } from '../../theme/colors';
import { formatPence } from '../../services/refundSlaService';
import {
  loopStateOf,
  daysLeftUntil,
  type RadarClaim,
} from './types';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

type FilterKey = 'ALL' | 'SETTLED' | 'IN_REVIEW' | 'EXPIRED';

const FILTER_PILLS: { key: FilterKey; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'SETTLED', label: 'Settled' },
  { key: 'IN_REVIEW', label: 'In Review' },
  { key: 'EXPIRED', label: 'Expired' },
];

function claimMatchesFilter(claim: RadarClaim, filter: FilterKey): boolean {
  const state = loopStateOf(claim);
  switch (filter) {
    case 'ALL':
      return true;
    case 'SETTLED':
      return state === 'received';
    case 'IN_REVIEW':
      return state === 'filed';
    case 'EXPIRED':
      return (
        state === 'closed' ||
        (state === 'eligible' && daysLeftUntil(claim.expiresAt) === 0)
      );
    default:
      return false;
  }
}

interface ClaimHistoryDrawerProps {
  visible: boolean;
  claims: RadarClaim[];
  onClose: () => void;
}

export const ClaimHistoryDrawer: React.FC<ClaimHistoryDrawerProps> = ({
  visible,
  claims,
  onClose,
}) => {
  const [filter, setFilter] = useState<FilterKey>('ALL');

  const filteredClaims = useMemo(
    () => claims.filter((c) => claimMatchesFilter(c, filter)),
    [claims, filter]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.dismissOverlay} onPress={onClose} />

        <View style={styles.sheetContainer}>
          <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFillObject} />

          <View style={styles.innerContent}>
            {/* Grabber handle */}
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.headerRow}>
              <View style={styles.headerTitleGroup}>
                <Receipt size={20} color="#0098D4" weight="bold" />
                <Text style={styles.headerTitle}>Claim History & Receipts</Text>
              </View>
              <Pressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onClose();
                }}
                style={styles.closeBtn}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={16} color="#FFFFFF" weight="bold" />
              </Pressable>
            </View>

            {/* Filter Pills */}
            <View style={styles.filterRow}>
              {FILTER_PILLS.map((p) => {
                const active = filter === p.key;
                return (
                  <Pressable
                    key={p.key}
                    style={[styles.filterPill, active && styles.filterPillActive]}
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setFilter(p.key);
                    }}
                  >
                    <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* List */}
            <FlatList
              data={filteredClaims}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyTitle}>No claims recorded</Text>
                  <Text style={styles.emptyDesc}>
                    When TfL delays over 15 minutes occur on your journeys, your receipts will appear here.
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const state = loopStateOf(item);
                const Icon =
                  state === 'received'
                    ? CheckCircle
                    : state === 'filed'
                    ? Clock
                    : state === 'eligible'
                    ? WarningCircle
                    : XCircle;
                const iconColor =
                  state === 'received'
                    ? '#34C759'
                    : state === 'filed'
                    ? '#0098D4'
                    : state === 'eligible'
                    ? '#F59E0B'
                    : 'rgba(255,255,255,0.35)';

                const dateStr = new Date(item.createdAt).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                });

                return (
                  <View style={styles.receiptCard}>
                    <View style={styles.receiptTop}>
                      <View style={styles.receiptLeft}>
                        <Icon size={18} color={iconColor} weight="bold" />
                        <Text style={styles.receiptLine}>{item.lineId.toUpperCase()}</Text>
                      </View>
                      <Text style={styles.receiptAmount}>
                        {formatPence(item.amountPence)}
                      </Text>
                    </View>
                    <View style={styles.receiptBottom}>
                      <Text style={styles.receiptDate}>{dateStr}</Text>
                      <Text style={[styles.receiptStatus, { color: iconColor }]}>
                        {state.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                );
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.60)',
    justifyContent: 'flex-end',
  },
  dismissOverlay: {
    flex: 1,
  },
  sheetContainer: {
    maxHeight: SCREEN_HEIGHT * 0.82,
    minHeight: 380,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    borderTopWidth: 1.25,
    borderLeftWidth: 1.25,
    borderRightWidth: 1.25,
    borderColor: GLASS.borderColor,
    backgroundColor: Platform.OS === 'android' ? '#0E111A' : GLASS.background,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.65,
    shadowRadius: 20,
    elevation: 16,
  },
  innerContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 34,
    flex: 1,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: GLASS.borderColor,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  filterPillActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderColor: GLASS.borderColor,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.60)',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingBottom: 24,
    gap: 10,
  },
  receiptCard: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    gap: 6,
  },
  receiptTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  receiptLine: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  receiptAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#34C759',
  },
  receiptBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptDate: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.45)',
  },
  receiptStatus: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  emptyWrap: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyDesc: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.50)',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
  },
});
