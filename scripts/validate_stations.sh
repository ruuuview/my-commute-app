#!/bin/bash
# scripts/validate_stations.sh
# Committable build test for verifying station resolution and live API connectivity.

python3 scripts/generate_test_urls.py

if [ ! -f scratch/urls.txt ]; then
  echo "Failed to generate scratch/urls.txt"
  exit 1
fi

echo "Running parallel live API checks via curl..."
failed=0
temp_dir="scratch/test_temp"
rm -rf "$temp_dir"
mkdir -p "$temp_dir"

# Set max concurrent jobs
MAX_JOBS=15
job_count=0

while IFS='|' read -r sid sname rid url; do
  if [ -z "$url" ]; then continue; fi
  
  # Run curl in background
  (
    response=$(curl -s -w "%{http_code}" "$url")
    http_code="${response: -3}"
    body="${response:0:${#response}-3}"
    
    # We allow empty departures list if it's 200, but block 404 or missing departures key
    if [ "$http_code" != "200" ]; then
      echo "❌ '$sname' -> '$rid' failed live call: HTTP $http_code" > "$temp_dir/$rid.err"
    elif [[ "$body" != *"departures"* ]]; then
      echo "❌ '$sname' -> '$rid' failed live call: JSON missing departures key" > "$temp_dir/$rid.err"
    else
      echo "✅ '$sname' -> '$rid' works"
    fi
  ) &
  
  job_count=$((job_count + 1))
  if [ "$job_count" -ge "$MAX_JOBS" ]; then
    # Wait for at least one background job to complete
    wait -n 2>/dev/null || wait
    job_count=$((job_count - 1))
  fi
done < scratch/urls.txt

# Wait for all remaining background jobs to finish
wait

# Check if any errors occurred
error_count=$(find "$temp_dir" -name "*.err" | wc -l)
if [ "$error_count" -gt 0 ]; then
  echo ""
  echo "--- API VALIDATION ERRORS ---"
  cat "$temp_dir"/*.err
  echo ""
  echo "❌ FAILED: $error_count station(s) failed validation!"
  rm -rf "$temp_dir"
  exit 1
else
  echo ""
  echo "✅ SUCCESS: 100% of stations resolve and fetch correctly from live backend!"
  rm -rf "$temp_dir"
  exit 0
fi
