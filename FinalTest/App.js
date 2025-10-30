import React, { useState } from 'react';
import { StyleSheet, Text, View, Button, ActivityIndicator } from 'react-native';
import axios from 'axios';

// IMPORTANT: Replace this with the actual URL your backend is running on.
const API_URL = 'http://10.64.137.143:8001/api/lines';

export default function App() {
  const [status, setStatus] = useState('Ready to test...');
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleFetch = async () => {
    console.log('--- TEST STARTED ---');
    setIsLoading(true);
    setStatus('Sending request...');
    setData(null);

    try {
      console.log(`Attempting to GET data from: ${API_URL}`);
      const response = await axios.get(API_URL, { timeout: 10000 }); // 10-second timeout
      console.log('--- SUCCESS! ---');
      console.log('Response Status:', response.status);
      setStatus('SUCCESS: Data was received!');
      setData(response.data);
    } catch (error) {
      console.log('--- ERROR! ---');
      if (error.request) {
        console.error('Error Request: No response received.', error.request);
      } else {
        console.error('Error Message:', error.message);
      }
      setStatus(`FAILED: An error occurred. Check the console.`);
    } finally {
      console.log('--- TEST FINISHED ---');
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>MRE Network Test</Text>
      <View style={styles.buttonContainer}>
        <Button title="Fetch Commute Data" onPress={handleFetch} disabled={isLoading} />
      </View>
      {isLoading && <ActivityIndicator size="large" color="#0000ff" />}
      <Text style={styles.status}>Status: {status}</Text>
      {data && (
        <View style={styles.results}>
          <Text style={styles.resultsTitle}>Data Received:</Text>
          <Text style={styles.resultsText}>{JSON.stringify(data, null, 2)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  buttonContainer: { marginBottom: 20 },
  status: { fontSize: 16, color: '#555', marginVertical: 10, textAlign: 'center' },
  results: { marginTop: 20, padding: 10, backgroundColor: '#f0f0f0', borderRadius: 5, width: '100%' },
  resultsTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 5 },
  resultsText: { fontFamily: 'monospace' },
});