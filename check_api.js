async function testEndpoints() {
  const stationId = '910GCANWHRF'; // Canary Wharf Elizabeth Line
  console.log(`Querying endpoints for station ${stationId}...\n`);

  // Test 1: Arrivals endpoint
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    const res = await fetch(`https://api.tfl.gov.uk/StopPoint/${stationId}/Arrivals`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    console.log(`[Arrivals Endpoint] Status: ${res.status}, Count: ${Array.isArray(data) ? data.length : typeof data}`);
    if (Array.isArray(data) && data.length > 0) {
      console.log('Sample data:', data.slice(0, 2));
    }
  } catch (err) {
    console.error('[Arrivals Endpoint] Failed:', err.message);
  }

  console.log('\n----------------------------------------\n');

  // Test 2: ArrivalDepartures endpoint
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    const res = await fetch(`https://api.tfl.gov.uk/StopPoint/${stationId}/ArrivalDepartures`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    console.log(`[ArrivalDepartures Endpoint] Status: ${res.status}, Count: ${Array.isArray(data) ? data.length : typeof data}`);
    if (Array.isArray(data) && data.length > 0) {
      console.log('Sample data:', data.slice(0, 2));
    }
  } catch (err) {
    console.error('[ArrivalDepartures] Failed:', err.message);
  }
}

testEndpoints().catch(err => {
  console.error('Fatal error during endpoint test:', err);
  process.exit(1);
});
