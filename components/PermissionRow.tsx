import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Switch, Pressable, StyleSheet, AppState, Linking } from 'react-native';
import {
  requestPermission,
  usePermissionOrchestrator,
} from '../store/permissionOrchestrator';
import type { PermissionKey } from '../store/permissionOrchestrator';
import { STATUS_SEVERITY_COLORS } from '../utils/getSeverityColor';

/**
 * PermissionRow — the Settings Hub row (plan step 6).
 *
 * One shared row for Location / Notifications / Calendar with THREE real
 * states, never a fake on/off:
 *   - Never asked  → tap fires the real OS dialog (through the orchestrator,
 *                    primer included).
 *   - Granted      → tap toggles the in-app feature ONLY (pause the feature
 *                    without touching OS permission).
 *   - Denied       → tap does nothing to the toggle; inline recovery line +
 *                    one tap to iOS Settings (the app can never re-open
 *                    Apple's dialog after a denial).
 *
 * The row reads the REAL OS permission status live and re-checks it on every
 * foreground return (user may have changed it manually in iOS Settings), then
 * syncs the orchestrator's copy of truth so no UI state can lie.
 */
interface PermissionRowProps {
  permissionKey: PermissionKey;
  /** Orchestrator analytics trigger, e.g. 'settings_toggle'. */
  trigger: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  iconColor: string;
  /** In-app feature state (what the granted-state toggle flips). */
  featureEnabled: boolean;
  onFeatureToggle: (value: boolean) => void;
  /** Live OS permission check — e.g. Notifications.getPermissionsAsync(). */
  checkOsStatus: () => Promise<boolean>;
}

export function PermissionRow({
  permissionKey,
  trigger,
  title,
  description,
  icon,
  iconColor,
  featureEnabled,
  onFeatureToggle,
  checkOsStatus,
}: PermissionRowProps) {
  const decision = usePermissionOrchestrator((s) => s.permissions[permissionKey]?.decision);
  const recordDecision = usePermissionOrchestrator((s) => s.recordDecision);
  const [osGranted, setOsGranted] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const granted = await checkOsStatus();
      setOsGranted(granted);
      // Sync the orchestrator's copy of truth to the real OS state so the
      // 3-state UI never lies after the user changes it in iOS Settings.
      if (granted) {
        recordDecision(permissionKey, 'granted');
      } else if (decision === 'granted') {
        recordDecision(permissionKey, 'denied');
      }
    } catch (e) {
      console.warn('[PermissionRow] OS status check failed:', e);
      // Keep last known state — don't flip UI on a failed probe.
    }
  }, [checkOsStatus, decision, permissionKey, recordDecision]);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const denied = !osGranted && decision === 'denied';
  const neverAsked = !osGranted && decision !== 'denied';

  const handleToggle = async (value: boolean) => {
    if (denied) return; // denied → the switch is inert; recovery line below
    if (value) {
      if (neverAsked) {
        const result = await requestPermission(permissionKey, trigger);
        if (result !== 'granted') return; // row stays off
        await new Promise((r) => setTimeout(r, 150));
        await refresh();
      }
      onFeatureToggle(true);
    } else {
      onFeatureToggle(false);
    }
  };

  return (
    <View style={styles.row}>
      <View style={styles.info}>
        <View style={styles.labelRow}>
          {icon}
          <Text style={styles.label}>{title}</Text>
        </View>
        <Text style={styles.description}>{description}</Text>
        {denied && (
          <Pressable onPress={() => Linking.openSettings().catch(() => {})} hitSlop={8}>
            <Text style={styles.denialLine}>
              {title} is off for My Commute — tap to fix in Settings
            </Text>
          </Pressable>
        )}
      </View>
      <Switch
        value={osGranted ? featureEnabled : false}
        onValueChange={handleToggle}
        trackColor={{ false: '#D1D5DB', true: '#007AFF' }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={denied ? '#5A5A66' : '#D1D5DB'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  info: {
    flex: 1,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 15,
    color: '#FFFFFF',
  },
  description: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  denialLine: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 12,
    color: STATUS_SEVERITY_COLORS.minor,
    marginTop: 4,
    textDecorationLine: 'underline',
  },
});
