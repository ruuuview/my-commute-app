import { APP_CONFIG } from '../config/app.config';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';

// ✅ Use Config
const API_BASE_URL = APP_CONFIG.BACKEND_URL;

export default function ApiTestScreen() {
  const { back } = useRouter();
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTest, setActiveTest] = useState<string>('');

  const testEndpoint = async (name: string, endpoint: string) => {
    setActiveTest(name);
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const url = `${API_BASE_URL}${endpoint}`;
      console.log('Testing endpoint:', url);

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
      }

      setResponse(data);
    } catch (err: any) {
      console.error('Error:', err);
      setError(err.message || 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const testAppGroup = async () => {
    setActiveTest('App Group Check');
    setLoading(true);
    setError(null);
    try {
      if (Platform.OS !== 'ios') throw new Error("App Groups are iOS only");
      
      const containerURL = (FileSystem as any).documentDirectory;
      setResponse({ 
        status: "Container Accessible", 
        path: containerURL,
        groupId: APP_CONFIG.APP_GROUP_ID 
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const tests = [
    {
      name: '1. API Connectivity',
      endpoint: '/api/lines',
      description: 'Fetch all lines (Basic connectivity check)',
    },
    {
      name: '2. Search "Bank"',
      endpoint: '/api/stations/search/bank',
      description: 'Test search functionality',
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => back()} style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.7 : 1 }]} accessibilityLabel="Go back" accessibilityRole="button">
          <Ionicons name="arrow-back" size={24} color="#000" />
        </Pressable>
        <Text style={styles.headerTitle}>Diagnostics</Text>
      </View>

      <ScrollView style={styles.scrollView} contentInsetAdjustmentBehavior="automatic">
        <View style={styles.testButtonsContainer}>
          <Text style={styles.sectionTitle}>Network Tests</Text>
          {tests.map((test, index) => (
            <Pressable
              key={test.name}
              style={({ pressed }) => [[styles.testButton, activeTest === test.name && styles.testButtonActive], { opacity: pressed ? 0.7 : 1 }]}
              onPress={() => testEndpoint(test.name, test.endpoint)}
              disabled={loading}
            >
              <Text style={styles.testButtonTitle}>{test.name}</Text>
              <Text style={styles.testButtonDescription}>{test.description}</Text>
            </Pressable>
          ))}

          <Text style={styles.sectionTitle}>System Tests</Text>
          <Pressable
            style={({ pressed }) => [styles.testButton, activeTest === 'App Group Check' && styles.testButtonActive, { opacity: pressed ? 0.7 : 1 }]}
            onPress={testAppGroup}
            disabled={loading}
          >
            <Text style={styles.testButtonTitle}>Check App Group</Text>
            <Text style={styles.testButtonDescription}>Verify Widget Storage Access</Text>
          </Pressable>
        </View>

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Running {activeTest}...</Text>
          </View>
        )}

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>❌ Failed</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {response && (
          <View style={styles.responseContainer}>
            <Text style={styles.responseTitle}>✅ Success</Text>
            <ScrollView horizontal style={styles.responseScroll}>
              <Text style={styles.responseText}>
                {JSON.stringify(response, null, 2)}
              </Text>
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: '#E0E0E0' },
  backButton: { marginRight: 16 },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  scrollView: { flex: 1 },
  testButtonsContainer: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12, marginTop: 12, color: '#333' },
  testButton: { backgroundColor: '#FFF', padding: 16, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#E0E0E0' },
  testButtonActive: { borderColor: '#007AFF', borderWidth: 2 },
  testButtonTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 4, color: '#000' },
  testButtonDescription: { fontSize: 14, color: '#666' },
  loadingContainer: { alignItems: 'center', padding: 24, backgroundColor: '#FFF', margin: 16, borderRadius: 8 },
  loadingText: { marginTop: 12, fontSize: 16, color: '#666' },
  errorContainer: { backgroundColor: '#FFEBEE', padding: 16, margin: 16, borderRadius: 8, borderWidth: 1, borderColor: '#EF5350' },
  errorTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8, color: '#C62828' },
  errorText: { fontSize: 14, color: '#C62828', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  responseContainer: { backgroundColor: '#E8F5E9', padding: 16, margin: 16, borderRadius: 8, borderWidth: 1, borderColor: '#66BB6A' },
  responseTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8, color: '#2E7D32' },
  responseScroll: { maxHeight: 300 },
  responseText: { fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', color: '#1B5E20' },
});