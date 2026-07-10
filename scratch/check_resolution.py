import re
import json

# 1. Parse tflStations.ts to get all station ids
with open('data/tflStations.ts', 'r') as f:
    tfl_stations_content = f.read()

# Find all { id: '...', name: '...' } patterns in TFL_STATIONS
station_ids = re.findall(r"id:\s*'([^']+)'", tfl_stations_content)
station_names = re.findall(r"name:\s*[\"']([^\"']+)[\"']", tfl_stations_content)

stations = list(zip(station_ids, station_names))
print(f"Loaded {len(stations)} stations from tflStations.ts")

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
            # parse array
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

# Verify all stations
failed = []
for sid, sname in stations:
    resolved = resolve_tfl_stop_ids(sid)
    is_valid = all(r.startswith('940GZZ') or r.startswith('910G') or r.startswith('HUB') for r in resolved)
    if not is_valid:
        failed.append((sid, sname, resolved))

print("\n--- RESOLUTION CHECK RESULTS ---")
if not failed:
    print("✅ SUCCESS: ALL STATIONS RESOLVED CORRECTLY TO NAPTAN OR HUB!")
else:
    print(f"❌ FAILED: {len(failed)} stations failed resolution:")
    for sid, sname, resolved in failed:
        print(f"  - Station '{sname}' (id: '{sid}') resolved to: {resolved}")
