import re
import json
import urllib.request
import urllib.error
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

# 1. Parse tflStations.ts to get all station ids
with open('data/tflStations.ts', 'r') as f:
    tfl_stations_content = f.read()

# Find all { id: '...', name: '...' } patterns in TFL_STATIONS
station_ids = re.findall(r"id:\s*'([^']+)'", tfl_stations_content)
station_names = re.findall(r"name:\s*[\"']([^\"']+)[\"']", tfl_stations_content)

stations = list(zip(station_ids, station_names))
print(f"Loaded {len(stations)} curated legacy station slugs from tflStations.ts")

# 2. Parse resolveTflStopId.ts to build maps
with open('utils/resolveTflStopId.ts', 'r') as f:
    resolver_content = f.read()

# Load fullStationsData JSON
with open('data/tflStationsFull.json', 'r') as f:
    full_stations_data = json.load(f)

# Build SLUG_TO_NAPTAN simulation
def to_slug(name):
    slug = name.lower()
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    slug = re.sub(r'^-+|-+$', '', slug)
    return slug

SLUG_TO_NAPTAN = {}
for entry in full_stations_data:
    entry_id = entry.get('id', '')
    if entry_id.startswith('940GZZ') or entry_id.startswith('910G'):
        slug = to_slug(entry.get('name', ''))
        existing = SLUG_TO_NAPTAN.get(slug)
        if not existing:
            SLUG_TO_NAPTAN[slug] = entry_id
        else:
            if existing.startswith('910G') and entry_id.startswith('940GZZ'):
                SLUG_TO_NAPTAN[slug] = entry_id

# Extract SLUG_TO_HUB map
slug_to_hub_block = re.search(r'const SLUG_TO_HUB: Record<string, string> = \{(.*?)\};', resolver_content, re.DOTALL)
SLUG_TO_HUB = {}
if slug_to_hub_block:
    for line in slug_to_hub_block.group(1).split('\n'):
        line = line.strip()
        if line and ':' in line:
            parts = line.split(':')
            k = parts[0].strip().replace("'", "").replace('"', '')
            v = parts[1].strip().replace("'", "").replace('"', '').replace(',', '')
            SLUG_TO_HUB[k] = v

# Extract EXPLICIT_MAP map
explicit_map_block = re.search(r'const EXPLICIT_MAP: Record<string, string\[\]> = \{(.*?)\};', resolver_content, re.DOTALL)
EXPLICIT_MAP = {}
if explicit_map_block:
    for line in explicit_map_block.group(1).split('\n'):
        line = line.strip()
        if line and ':' in line:
            parts = line.split(':')
            k = parts[0].strip().replace("'", "").replace('"', '')
            arr_str = parts[1].strip()
            arr_matches = re.findall(r"['\"]([^'\"]+)['\"]", arr_str)
            EXPLICIT_MAP[k] = arr_matches

def resolve_tfl_stop_ids(station_id):
    if station_id.startswith('HUB') or station_id.startswith('940GZZ') or station_id.startswith('910G'):
        return [station_id]
    
    slug = to_slug(station_id)
    if slug in EXPLICIT_MAP:
        return EXPLICIT_MAP[slug]
    if station_id in EXPLICIT_MAP:
        return EXPLICIT_MAP[station_id]
        
    if slug in SLUG_TO_NAPTAN:
        return [SLUG_TO_NAPTAN[slug]]
        
    return [station_id]

# 3. Verify all stations & hit live Vercel backend in parallel
backend_base = "https://my-commute-brain.vercel.app/api/stations"
failed_resolution = []
failed_live = []

print("\n--- RESOLUTION & LIVE BACKEND API CHECK ---")

def verify_single_id(sid, sname, rid):
    url = f"{backend_base}/{rid}"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode())
            if 'departures' not in data:
                raise ValueError("JSON missing 'departures' property")
            dept_count = len(data.get('departures', []))
            return (True, sid, sname, rid, dept_count, None)
    except Exception as e:
        return (False, sid, sname, rid, 0, f"{url} -> {e}")

tasks = []
for sid, sname in stations:
    resolved = resolve_tfl_stop_ids(sid)
    is_resolved = all(r.startswith('940GZZ') or r.startswith('910G') or r.startswith('HUB') for r in resolved)
    
    if not is_resolved:
        failed_resolution.append((sid, sname, resolved))
        print(f"❌ '{sname}' (id: '{sid}') failed resolution: resolved to {resolved}")
        continue

    for rid in resolved:
        tasks.append((sid, sname, rid))

# Execute live calls in parallel (20 threads)
with ThreadPoolExecutor(max_workers=20) as executor:
    futures = {executor.submit(verify_single_id, t[0], t[1], t[2]): t for t in tasks}
    for future in as_completed(futures):
        success, sid, sname, rid, dept_count, err_msg = future.result()
        if success:
            print(f"✅ '{sname}' -> '{rid}' works ({dept_count} live departures)")
        else:
            failed_live.append((sid, sname, rid, err_msg))
            print(f"❌ '{sname}' -> '{rid}' failed live call: {err_msg}")

print("\n--- FINAL AUDIT SUMMARY ---")
if not failed_resolution and not failed_live:
    print("✅ SUCCESS: 100% of stations resolve and fetch correctly from live backend!")
    sys.exit(0)
else:
    if failed_resolution:
        print(f"⚠️ {len(failed_resolution)} stations failed resolution mappings.")
    if failed_live:
        print(f"⚠️ {len(failed_live)} stations failed live backend API validation.")
    sys.exit(1)
