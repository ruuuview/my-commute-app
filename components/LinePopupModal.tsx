/**
 * LinePopupModal.tsx
 * ─────────────────────────────────────────────────────────────────
 * Absolute-positioned overlay for line status detail.
 * Same positioning spec as StationDetailModal: flip logic, scrim, blur.
 * ─────────────────────────────────────────────────────────────────
 */

import React, { useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GLASS } from '../theme/colors';
import { GlassRim } from './GlassRim';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SCREEN_WIDTH = Dimensions.get('window').width;

export interface LinePopupModalProps {
  lineId: string;
  lineName: string;
  lineColor: string;
  status: string;
  anchorPageY: number;
  anchorHeight: number;
  onDismiss: () => void;
}

export default function LinePopupModal({
  lineName,
  lineColor,
  status,
  anchorPageY,
  anchorHeight,
  onDismiss,
}: LinePopupModalProps) {
  const { top: safeAreaTop } = useSafeAreaInsets();
  const [popupHeight, setPopupHeight] = React.useState(0);

  const measured = popupHeight > 0;
  const popupTop = useMemo(() => {
    if (!measured) return anchorPageY + anchorHeight + 8;
    const spaceBelow = SCREEN_HEIGHT - (anchorPageY + anchorHeight);
    if (spaceBelow >= SCREEN_HEIGHT * 0.6) {
      return anchorPageY + anchorHeight + 8;
    }
    const above = anchorPageY - popupHeight - 8;
    const floor = safeAreaTop + 12;
    return Math.max(above, floor);
  }, [measured, popupHeight, anchorPageY, anchorHeight, safeAreaTop]);

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={onDismiss}
      testID="line-popup-modal"
    >
      <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
        <Pressable
          style={[StyleSheet.absoluteFillObject, s.scrim]}
          onPress={onDismiss}
          testID="line-modal-scrim"
        />

        <View
          style={[
            s.panel,
            {
              top: popupTop,
              left: 16,
              width: SCREEN_WIDTH - 32,
              opacity: measured ? 1 : 0,
            },
          ]}
          onLayout={e => setPopupHeight(e.nativeEvent.layout.height)}
          testID="line-popup-panel"
        >
          {Platform.OS === 'ios' ? (
            <BlurView intensity={GLASS.blurIntensity} tint="dark" style={StyleSheet.absoluteFillObject}>
              <GlassRim borderRadius={20} />
            </BlurView>
          ) : (
            <View style={[StyleSheet.absoluteFillObject, s.androidBg]} />
          )}

          <View style={s.content}>
            <View style={s.header}>
              <View style={[s.colorBar, { backgroundColor: lineColor }]} />
              <Text style={s.lineName} numberOfLines={1}>{lineName}</Text>
              <Pressable onPress={onDismiss} hitSlop={12} style={s.closeHitArea} testID="line-modal-close">
                <Text style={s.closeBtn}>✕</Text>
              </Pressable>
            </View>

            <Text style={s.statusText}>{status}</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: {
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  panel: {
    position: 'absolute',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GLASS.borderSide,
    overflow: 'hidden',
    shadowColor: GLASS.shadowColor,
    shadowOffset: GLASS.shadowOffset,
    shadowOpacity: GLASS.shadowOpacity,
    shadowRadius: GLASS.shadowRadius,
    elevation: 15,
  },
  androidBg: {
    backgroundColor: 'rgba(10,10,15,0.95)',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  colorBar: {
    width: 3,
    height: 20,
    borderRadius: 2,
  },
  lineName: {
    flex: 1,
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  closeHitArea: {
    padding: 4,
  },
  closeBtn: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },
  statusText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 20,
  },
});
