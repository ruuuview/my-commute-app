import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const API_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

export default function ApiTestScreen() {
  const router = useRouter();
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
      console.log('Success:', data);
    } catch (err: any) {
      console.error('Error:', err);
      setError(err.message || 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const tests = [
    {
      name: 'API Health Check',
      endpoint: '/api/',
      description: 'Test basic API connectivity',
    },
    {
      name: 'All Line Status',
      endpoint: '/api/lines',
      description: 'Fetch status of all tube lines from TfL',
    },
    {
      name: 'Single Line (Victoria)',
      endpoint: '/api/lines/victoria',
      description: 'Get Victoria Line status',
    },
    {
      name: 'Single Line (Central)',
      endpoint: '/api/lines/central',
      description: 'Get Central Line status',
    },
    {
      name: 'Station Arrivals (Victoria)',
      endpoint: '/api/stations/940GZZLUVIC',
      description: 'Live departures from Victoria Station',
    },
    {
      name: 'Station Arrivals (King\'s Cross)',
      endpoint: '/api/stations/940GZZLUKSX',
      description: 'Live departures from King\'s Cross St. Pancras',
    },
    {
      name: 'Station Search (Oxford)',
      endpoint: '/api/stations/search/oxford',
      description: 'Search for stations containing "oxford"',
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>TfL API Test Screen</Text>
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Test Buttons */}
        <View style={styles.testButtonsContainer}>
          <Text style={styles.sectionTitle}>Available Tests</Text>
          {tests.map((test, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.testButton,
                activeTest === test.name && styles.testButtonActive,
              ]}
              onPress={() => testEndpoint(test.name, test.endpoint)}
              disabled={loading}
            >
              <Text style={styles.testButtonTitle}>{test.name}</Text>
              <Text style={styles.testButtonDescription}>{test.description}</Text>
              <Text style={styles.testButtonEndpoint}>{test.endpoint}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Loading Indicator */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0066CC" />
            <Text style={styles.loadingText}>Testing {activeTest}...</Text>
          </View>
        )}

        {/* Error Display */}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>❌ Error</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Response Display */}
        {response && (
          <View style={styles.responseContainer}>
            <Text style={styles.responseTitle}>✅ Response</Text>
            <ScrollView horizontal style={styles.responseScroll}>
              <Text style={styles.responseText}>
                {JSON.stringify(response, null, 2)}
              </Text>
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
  },
  testButtonsContainer: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  testButton: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  testButtonActive: {
    borderColor: '#0066CC',
    borderWidth: 2,
  },
  testButtonTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#000',
  },
  testButtonDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  testButtonEndpoint: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#0066CC',
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
    margin: 16,
    borderRadius: 8,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    backgroundColor: '#FFEBEE',
    padding: 16,
    margin: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EF5350',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#C62828',
  },
  errorText: {
    fontSize: 14,
    color: '#C62828',
    fontFamily: 'monospace',
  },
  responseContainer: {
    backgroundColor: '#E8F5E9',
    padding: 16,
    margin: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#66BB6A',
  },
  responseTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#2E7D32',
  },
  responseScroll: {
    maxHeight: 400,
  },
  responseText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#1B5E20',
  },
});
