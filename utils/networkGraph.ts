// utils/networkGraph.ts
//
// Weighted adjacency graph for TfL tube/DLR/Overground/Elizabeth line stations.
// Builds a graph from LINE_ROUTES data where nodes are NaPTAN station IDs,
// edges connect consecutive stations on the same route, and edge weights are
// estimated travel times (2 min for Underground, 3 min for other modes).
//
// Exports:
//   buildNetworkGraph()   → StationGraph (adjacency map)
//   findShortestPath()    → { stations: string[], totalTime: number }

import { LINE_ROUTES } from './lineRoutes';

// ── Types ─────────────────────────────────────────────────────────

export interface StationGraph {
  /** Adjacency map: stationNaPTAN → [{ neighbor, travelTimeMinutes }] */
  [stationId: string]: { neighbor: string; travelTimeMinutes: number }[];
}

export interface PathResult {
  stations: string[];
  totalTime: number;
}

// ── Travel time estimation ────────────────────────────────────────

const UNDERGROUND_PREFIXES = ['940GZZLU'];
const OVERGROUND_PREFIXES = ['910G'];
const DLR_PREFIX = '940GZZDL';
const ELIZABETH_LINE_STATIONS = new Set<string>();

// Elizabeth line stations use 910G prefix (National Rail) and some 940GZZ...
// We detect them by scanning which lines they belong to.
function isElizabeth(naptanId: string): boolean {
  return ELIZABETH_LINE_STATIONS.has(naptanId);
}

function isUnderground(naptanId: string): boolean {
  return UNDERGROUND_PREFIXES.some(p => naptanId.startsWith(p)) && !isElizabeth(naptanId);
}

function isDLR(naptanId: string): boolean {
  return naptanId.startsWith(DLR_PREFIX);
}

function isOverground(naptanId: string): boolean {
  return OVERGROUND_PREFIXES.some(p => naptanId.startsWith(p)) && !isElizabeth(naptanId);
}

// ⚡ Travel time per stop by mode
// Underground: 2 min (closer station spacing, higher frequency)
// Overground/DLR/Elizabeth: 3 min (wider spacing)
function travelTimePerStop(naptanId: string): number {
  if (isUnderground(naptanId)) return 2;
  return 3;
}

// ── Build the graph ───────────────────────────────────────────────

let _graph: StationGraph | null = null;

function ensureElizabethSet(): void {
  if (ELIZABETH_LINE_STATIONS.size > 0) return;
  const elRoutes = LINE_ROUTES['elizabeth'];
  if (!elRoutes) return;
  for (const dir of ['inbound', 'outbound'] as const) {
    for (const route of elRoutes[dir]) {
      for (const nid of route.naptanIds) {
        ELIZABETH_LINE_STATIONS.add(nid);
      }
    }
  }
}

export function buildNetworkGraph(): StationGraph {
  if (_graph) return _graph;

  ensureElizabethSet();
  const graph: StationGraph = {};

  function addEdge(a: string, b: string, weight: number): void {
    if (!graph[a]) graph[a] = [];
    // Avoid duplicate edges (same neighbor, keep the shorter weight)
    const existing = graph[a].find(e => e.neighbor === b);
    if (existing) {
      if (weight < existing.travelTimeMinutes) {
        existing.travelTimeMinutes = weight;
      }
    } else {
      graph[a].push({ neighbor: b, travelTimeMinutes: weight });
    }
  }

  // Iterate over every line and every route, adding edges between consecutive stations
  for (const lineId of Object.keys(LINE_ROUTES)) {
    const line = LINE_ROUTES[lineId];
    if (!line) continue;

    for (const dir of ['inbound', 'outbound'] as const) {
      for (const route of line[dir]) {
        const ids = route.naptanIds;
        for (let i = 0; i < ids.length - 1; i++) {
          const a = ids[i];
          const b = ids[i + 1];
          // Use the mode-appropriate travel time per stop
          const weight = travelTimePerStop(a);
          addEdge(a, b, weight);
          addEdge(b, a, weight); // bidirectional
        }
      }
    }
  }

  _graph = graph;
  return graph;
}

// ── Dijkstra's shortest path ──────────────────────────────────────

export function findShortestPath(
  from: string,
  to: string,
  graph?: StationGraph
): PathResult {
  const g = graph ?? buildNetworkGraph();

  if (!g[from]) {
    throw new Error(`Unknown start station: "${from}" — not found in network graph`);
  }
  if (!g[to]) {
    throw new Error(`Unknown destination station: "${to}" — not found in network graph`);
  }
  if (from === to) {
    return { stations: [from], totalTime: 0 };
  }

  // Standard Dijkstra
  const distances: Record<string, number> = {};
  const previous: Record<string, string | null> = {};
  const visited = new Set<string>();

  // Priority queue via simple array (sufficient for ~500 node graph)
  const unvisited = new Set<string>();

  for (const nodeId of Object.keys(g)) {
    distances[nodeId] = Infinity;
    previous[nodeId] = null;
    unvisited.add(nodeId);
  }
  distances[from] = 0;

  while (unvisited.size > 0) {
    // Find the unvisited node with smallest distance
    let current: string | null = null;
    let minDist = Infinity;
    for (const nodeId of Array.from(unvisited)) {
      if (distances[nodeId] < minDist) {
        minDist = distances[nodeId];
        current = nodeId;
      }
    }

    if (current === null || current === to) break;
    if (distances[current] === Infinity) break; // unreachable

    unvisited.delete(current);
    visited.add(current);

    const neighbors = g[current] ?? [];
    for (const { neighbor, travelTimeMinutes } of neighbors) {
      if (visited.has(neighbor)) continue;
      const alt = distances[current] + travelTimeMinutes;
      if (alt < distances[neighbor]) {
        distances[neighbor] = alt;
        previous[neighbor] = current;
      }
    }
  }

  // Reconstruct path
  if (distances[to] === Infinity) {
    throw new Error(`No path found between "${from}" and "${to}"`);
  }

  const path: string[] = [];
  let step: string | null = to;
  while (step !== null) {
    path.unshift(step);
    step = previous[step];
  }

  return {
    stations: path,
    totalTime: distances[to],
  };
}

// ── Clear cache (useful for testing / hot reload) ─────────────────

export function clearGraphCache(): void {
  _graph = null;
  ELIZABETH_LINE_STATIONS.clear();
}
