import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Define the props this component needs
interface ProStatusCardProps {
  isPro: boolean;
  trialDaysRemaining: number;
  onUpgrade: () => void;
}

/**
 * Smart Pro Status Card Component
 * Shows only ONE relevant status based on user's subscription state:
 * - Pro Member (paid)
 * - Pro Trial Active (trial in progress)
 * - Free Plan (trial ended or never started)
 */
export const ProStatusCard: React.FC<ProStatusCardProps> = ({ 
  isPro, 
  trialDaysRemaining,
  onUpgrade 
}) => {

  // SCENARIO 1: User is a paid Pro member
  if (isPro) {
    return (
      <View style={styles.card}>
        <View style={styles.row}>
          <Ionicons name="shield-checkmark" size={24} color="#388E3C" style={styles.icon} />
          <View style={styles.textContainer}>
            <Text style={styles.title}>You are a Pro Member</Text>
            <Text style={styles.subtitle}>You have unlimited lifetime access.</Text>
          </View>
        </View>
      </View>
    );
  }

  // SCENARIO 2: User is in the Pro Trial
  if (trialDaysRemaining > 0) {
    return (
      <View style={styles.card}>
        <View style={styles.row}>
          <Ionicons name="time" size={24} color="#007AFF" style={styles.icon} />
          <View style={styles.textContainer}>
            <Text style={styles.title}>Pro Trial Active</Text>
            <Text style={styles.subtitle}>
              You have {trialDaysRemaining} days of all-access features remaining.
            </Text>
          </View>
        </View>
        <Pressable style={({ pressed }) => [styles.button, { opacity: pressed ? 0.7 : 1 }]} onPress={onUpgrade}>
          <Text style={styles.buttonText}>Upgrade for Life - £7.99</Text>
        </Pressable>
      </View>
    );
  }

  // SCENARIO 3: User is on the Free plan (trial ended)
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Ionicons name="lock-closed" size={24} color="#E74C3C" style={styles.icon} />
        <View style={styles.textContainer}>
          <Text style={styles.title}>You are on the Free Plan</Text>
          <Text style={styles.subtitle}>You are limited to 3 items. Upgrade for unlimited access.</Text>
        </View>
      </View>
      <Pressable style={({ pressed }) => [styles.button, { opacity: pressed ? 0.7 : 1 }]} onPress={onUpgrade}>
        <Text style={styles.buttonText}>Upgrade for Life - £7.99</Text>
      </Pressable>
    </View>
  );
};

// Styles for the new component
const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 24,
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  subtitle: {
    fontSize: 14,
    color: '#6E6E73',
    marginTop: 4,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
