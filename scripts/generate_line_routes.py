#!/usr/bin/env python3
"""
Generate utils/lineRoutes.ts from the fetched TfL API data.
Reads data/tflRouteData.json and produces a typed TypeScript file.
"""
import json
import os
import re

def clean_station_name(raw: str) -> str:
    """Strip suffixes like ' Underground Station', ' DLR Station', etc."""
    if not raw:
        return raw
    suffixes = [
        ' Elizabeth line Station',
        ' Underground Station',
        ' Overground Station',
        ' DLR Station',
        ' Rail Station',
        ' Station',
    ]
    name = raw
    for suffix in suffixes:
        if name.endswith(suffix):
            name = name[:-len(suffix)]
            break
    name = name.strip()
    return name

def strip_html_entity(s: str) -> str:
    return s.replace('&harr;', '↔').strip()

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    with open(os.path.join(root, 'data', 'tflRouteData.json')) as f:
        data = json.load(f)

    routes_data = data['routes']
    stations_data = data['stations']

    # Build station name lookup (cleaned)
    station_names: dict[str, str] = {}
    station_zones: dict[str, int | None] = {}
    for nid, info in stations_data.items():
        station_names[nid] = clean_station_name(info['name'])
        z = info.get('zone')
        if z is not None:
            try:
                station_zones[nid] = int(z)
            except (ValueError, TypeError):
                station_zones[nid] = None
        else:
            station_zones[nid] = None

    lines_acc = []
    lines_acc.append('// utils/lineRoutes.ts')
    lines_acc.append('// Auto-generated static route data from TfL API.')
    lines_acc.append('// Do not edit directly — regenerate via scripts/fetch_route_data.py + scripts/generate_line_routes.py')
    lines_acc.append('')
    lines_acc.append('export interface RouteInfo {')
    lines_acc.append('  name: string;')
    lines_acc.append('  naptanIds: string[];')
    lines_acc.append('  serviceType: string;')
    lines_acc.append('}')
    lines_acc.append('')
    lines_acc.append('export interface LineRoutes {')
    lines_acc.append('  routes: RouteInfo[];')
    lines_acc.append('}')
    lines_acc.append('')
    lines_acc.append('export interface StationInfo {')
    lines_acc.append('  name: string;')
    lines_acc.append('  zone?: number;')
    lines_acc.append('}')
    lines_acc.append('')
    lines_acc.append('export type LineRoutesMap = Record<string, {')
    lines_acc.append('  inbound: RouteInfo[];')
    lines_acc.append('  outbound: RouteInfo[];')  
    lines_acc.append('}>;')
    lines_acc.append('')
    lines_acc.append('export const LINE_ROUTES: LineRoutesMap = {')
    
    # Sort line IDs for deterministic output
    for line_id in sorted(routes_data.keys()):
        line_info = routes_data[line_id]
        lines_acc.append(f'  "{line_id}": {{')
        
        for direction in ['inbound', 'outbound']:
            routes_list = line_info.get(direction, [])
            lines_acc.append(f'    {direction}: [')
            for route in routes_list:
                name = strip_html_entity(route['name'])
                naptan_ids = route['naptanIds']
                service_type = route.get('serviceType', 'Regular')
                
                # Format naptanIds as a compact array
                naptan_str = json.dumps(naptan_ids)
                lines_acc.append(f'      {{')
                lines_acc.append(f'        name: {json.dumps(name)},')
                lines_acc.append(f'        naptanIds: {naptan_str},')
                lines_acc.append(f'        serviceType: {json.dumps(service_type)},')
                lines_acc.append(f'      }},')
            lines_acc.append(f'    ],')
        
        lines_acc.append(f'  }},')
    
    lines_acc.append('};')
    lines_acc.append('')

    # Station name/zone lookup
    lines_acc.append('// Station name and zone lookup')
    lines_acc.append('export const LINE_STATIONS: Record<string, StationInfo> = {')
    
    # Sort by NaPTAN ID
    for nid in sorted(station_names.keys()):
        name_escaped = json.dumps(station_names[nid])
        zone = station_zones.get(nid)
        if zone is not None:
            lines_acc.append(f'  {json.dumps(nid)}: {{ name: {name_escaped}, zone: {zone} }},')
        else:
            lines_acc.append(f'  {json.dumps(nid)}: {{ name: {name_escaped} }},')
    
    lines_acc.append('};')
    lines_acc.append('')
    
    # Helper: get all stations for a line (union of all route NaPTANs)
    lines_acc.append('// Get all unique station IDs served by a line')
    lines_acc.append('export function getLineStations(lineId: string): string[] {')
    lines_acc.append('  const routes = LINE_ROUTES[lineId];')
    lines_acc.append('  if (!routes) return [];')
    lines_acc.append('  const seen = new Set<string>();')
    lines_acc.append('  for (const dir of [\'inbound\', \'outbound\'] as const) {')
    lines_acc.append('    for (const route of routes[dir]) {')
    lines_acc.append('      for (const nid of route.naptanIds) {')
    lines_acc.append('        seen.add(nid);')
    lines_acc.append('      }')
    lines_acc.append('    }')
    lines_acc.append('  }')
    lines_acc.append('  return Array.from(seen);')
    lines_acc.append('}')
    lines_acc.append('')
    
    lines_acc.append('// Get station display name from NaPTAN ID')
    lines_acc.append('export function getStationName(naptanId: string): string | undefined {')
    lines_acc.append('  return LINE_STATIONS[naptanId]?.name;')
    lines_acc.append('}')
    lines_acc.append('')

    output = '\n'.join(lines_acc)
    
    output_path = os.path.join(root, 'utils', 'lineRoutes.ts')
    with open(output_path, 'w') as f:
        f.write(output)
    
    print(f"Generated {output_path}")
    print(f"  {len(routes_data)} lines")
    total_routes = sum(len(v.get('inbound', [])) + len(v.get('outbound', [])) for v in routes_data.values())
    print(f"  {total_routes} routes")
    print(f"  {len(station_names)} stations")

if __name__ == '__main__':
    main()
