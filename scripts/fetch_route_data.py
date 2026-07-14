#!/usr/bin/env python3
import json
import urllib.request
import urllib.error
import time
import sys
import os

LINES = [
    "bakerloo", "central", "circle", "district", "dlr", "elizabeth",
    "hammersmith-city", "jubilee", "metropolitan", "northern", "piccadilly",
    "victoria", "waterloo-city",
    "liberty", "lioness", "mildmay", "suffragette", "weaver", "windrush"
]

DIRECTIONS = ["inbound", "outbound"]

def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

def main():
    output_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
    os.makedirs(output_dir, exist_ok=True)
    
    all_route_data = {}
    all_ordered_routes = {}
    
    for line_id in LINES:
        print(f"Fetching {line_id}...", flush=True)
        line_routes = {}
        for direction in DIRECTIONS:
            url = f"https://api.tfl.gov.uk/Line/{line_id}/Route/Sequence/{direction}"
            try:
                data = fetch_json(url)
                ordered_routes = data.get("orderedLineRoutes", [])
                line_routes[direction] = []
                for r in ordered_routes:
                    name = r.get("name", "")
                    naptan_ids = r.get("naptanIds", [])
                    service_type = r.get("serviceType", "regular")
                    line_routes[direction].append({
                        "name": name,
                        "naptanIds": naptan_ids,
                        "serviceType": service_type
                    })
                print(f"  {direction}: {len(line_routes[direction])} routes", flush=True)
            except urllib.error.HTTPError as e:
                print(f"  {direction}: HTTP {e.code}", flush=True)
                line_routes[direction] = []
            except Exception as e:
                print(f"  {direction}: {e}", flush=True)
                line_routes[direction] = []
            time.sleep(0.3)  # Rate limiting
        all_route_data[line_id] = line_routes
    
    # Also fetch StopPoint data for station name/id mapping
    print("\nFetching stop points...", flush=True)
    modes = "tube,dlr,overground,elizabeth-line"
    url = f"https://api.tfl.gov.uk/StopPoint/Mode/{modes}"
    
    station_map = {}
    try:
        data = fetch_json(url)
        for sp in data.get("stopPoints", []):
            naptan_id = sp.get("naptanId", "")
            common_name = sp.get("commonName", "")
            # Get zone info
            zone = None
            for prop in sp.get("additionalProperties", []):
                if prop.get("key") == "Zone":
                    zone = prop.get("value")
                    break
            if naptan_id:
                station_map[naptan_id] = {
                    "name": common_name,
                    "zone": zone
                }
        print(f"Fetched {len(station_map)} stop points", flush=True)
    except Exception as e:
        print(f"StopPoint error: {e}", flush=True)
    
    # Save all data
    output = {
        "routes": all_route_data,
        "stations": station_map,
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }
    
    output_path = os.path.join(output_dir, "tflRouteData.json")
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\nSaved to {output_path}", flush=True)
    
    # Also generate a compact station name lookup
    station_names = {}
    for naptan_id, info in station_map.items():
        station_names[naptan_id] = info["name"]
    
    names_path = os.path.join(output_dir, "tflStationNames.json")
    with open(names_path, "w") as f:
        json.dump(station_names, f, indent=2)
    print(f"Saved station names to {names_path}", flush=True)

if __name__ == "__main__":
    main()
