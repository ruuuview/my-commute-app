// frontend/components/PermissionExplainerModal.tsx
// 2-Step Location Permission Explainer Modal for iOS 13+.
// Sequence:
// 1. Clear, respectful explainer: why "Always Allow" is needed to show Lock Screen arrivals without opening the app.
// 2. User taps "Continue" -> requestForegroundPermissionsAsync() (WhenInUse)
// 3. Upgrade prompt -> requestBackgroundPermissionsAsync() (Always)

import React, { useState } from 'react'
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Linking,
} from 'react-native'
import { BlurView } from 'expo-blur'
import * as Haptics from 'expo-haptics'
import * as Location from 'expo-location'
import { MapPin, Bell, ShieldCheck, X } from 'phosphor-react-native'

export interface PermissionExplainerModalProps {
  visible: boolean
  onClose: () => void
  onGranted: () => void
  onDenied: () => void
}

export default function PermissionExplainerModal({
  visible,
  onClose,
  onGranted,
  onDenied,
}: PermissionExplainerModalProps) {
  const [isRequesting, setIsRequesting] = useState(false)

  const handleRequestPermission = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setIsRequesting(true)

    try {
      // Step 1: Request Foreground (WhenInUse) first
      const fgStatus = await Location.requestForegroundPermissionsAsync()

      if (fgStatus.status !== 'granted') {
        setIsRequesting(false)
        onDenied()
        return
      }

      // Step 2: Request Background (Always upgrade) for geofence wakeup in pocket
      if (Platform.OS === 'ios') {
        const bgStatus = await Location.requestBackgroundPermissionsAsync()
        setIsRequesting(false)

        if (bgStatus.status === 'granted') {
          onGranted()
        } else {
          // User chose "Keep Only While Using" or denied background
          onDenied()
        }
      } else {
        setIsRequesting(false)
        onGranted()
      }
    } catch (err) {
      console.warn('[PermissionExplainerModal] Error requesting location permissions:', err)
      setIsRequesting(false)
      onDenied()
    }
  }

  const handleOpenSettings = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    void Linking.openSettings()
  }

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />

        <View style={styles.card}>
          <Pressable
            style={styles.closeButton}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Dismiss permission explanation"
          >
            <X size={18} color="#FFFFFF" weight="bold" />
          </Pressable>

          <View style={styles.iconContainer}>
            <MapPin size={32} color="#0098D4" weight="fill" />
          </View>

          <Text style={styles.title}>Zero-Open Lock Screen</Text>

          <Text style={styles.body}>
            To automatically show live train arrivals on your Lock Screen the moment you walk into your station—without you ever opening the app—iOS requires <Text style={styles.bold}>&ldquo;Always Allow&rdquo;</Text> location access.
          </Text>

          <View style={styles.bulletList}>
            <View style={styles.bulletItem}>
              <Bell size={18} color="#0098D4" weight="fill" style={styles.bulletIcon} />
              <Text style={styles.bulletText}>Wakes up silently when entering your station</Text>
            </View>
            <View style={styles.bulletItem}>
              <ShieldCheck size={18} color="#30D158" weight="fill" style={styles.bulletIcon} />
              <Text style={styles.bulletText}>0% battery drain while asleep away from stations</Text>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
              isRequesting && styles.disabledButton,
            ]}
            onPress={handleRequestPermission}
            disabled={isRequesting}
          >
            <Text style={styles.primaryButtonText}>
              {isRequesting ? 'Connecting...' : 'Continue to Enable'}
            </Text>
          </Pressable>

          <Pressable style={styles.settingsLink} onPress={handleOpenSettings}>
            <Text style={styles.settingsLinkText}>Already chosen? Open iPhone Settings</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: 'rgba(28, 28, 30, 0.95)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 152, 212, 0.16)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 10,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.75)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 18,
  },
  bold: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  bulletList: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    gap: 10,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bulletIcon: {
    marginRight: 10,
  },
  bulletText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.85)',
    flex: 1,
  },
  primaryButton: {
    width: '100%',
    backgroundColor: '#0098D4',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  disabledButton: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  settingsLink: {
    marginTop: 14,
    padding: 4,
  },
  settingsLinkText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    textDecorationLine: 'underline',
  },
})
