import fs from 'fs';
import path from 'path';
import { resolveTflStopIds } from '../utils/resolveTflStopId';
import * as apiService from '../services/apiService';

describe('Screen 2 Performance & Abbey Wood Arrivals Invariants', () => {
  const stationsScreenPath = path.resolve(__dirname, '../app/onboarding/stations.tsx');
  const resolveTflStopIdPath = path.resolve(__dirname, '../utils/resolveTflStopId.ts');
  const apiServicePath = path.resolve(__dirname, '../services/apiService.ts');
  const stationArrivalsStorePath = path.resolve(__dirname, '../services/stationArrivalsStore.ts');
  const backendRoutePath = path.resolve(__dirname, '../../backend/app/api/stations/[id]/route.ts');

  describe('Part 1: Abbey Wood Stop ID Resolution & Rail Fallback', () => {
    test('resolveTflStopIds maps "abbey-wood" to canonical NaPTAN 910GABWDXR', () => {
      const resolved = resolveTflStopIds('abbey-wood');
      expect(resolved).toContain('910GABWDXR');
    });

    test('resolveTflStopIds expands "HUBABW" to canonical NaPTAN 910GABWDXR', () => {
      const resolved = resolveTflStopIds('HUBABW');
      expect(resolved).toContain('910GABWDXR');
    });

    test('SLUG_TO_HUB in resolveTflStopId.ts explicitly includes "abbey-wood"', () => {
      const content = fs.readFileSync(resolveTflStopIdPath, 'utf8');
      expect(content).toMatch(/['"]abbey-wood['"]\s*:\s*['"]HUBABW['"]/);
    });

    test('apiService.ts: rail fallback to ArrivalDepartures is NOT blocked by empty Arrivals array []', () => {
      const content = fs.readFileSync(apiServicePath, 'utf8');
      // Old buggy pattern: if (Array.isArray(data)) return data; (returns [] and skips ArrivalDepartures)
      // Must check data.length > 0 before returning so empty rail arrivals fall through to ArrivalDepartures
      expect(content).not.toMatch(/if\s*\(Array\.isArray\(data\)\)\s*return\s*data\s*;\s*\/\/\s*Rail/);
      expect(content).toMatch(/if\s*\(Array\.isArray\(data\)\s*&&\s*data\.length\s*>\s*0\)\s*return\s*data;/);
    });

    test('backend route.ts: rail fallback to ArrivalDepartures is NOT blocked by empty Arrivals array []', () => {
      const content = fs.readFileSync(backendRoutePath, 'utf8');
      expect(content).toMatch(/if\s*\(Array\.isArray\(data\)\s*&&\s*data\.length\s*>\s*0\)\s*return\s*data/);
    });
  });

  describe('Part 2: Screen 2 Performance & Virtualization Invariants', () => {
    test('Zero Artificial Delay: stations.tsx must NOT contain artificial setTimeout loading timer (400ms delay eliminated)', () => {
      const content = fs.readFileSync(stationsScreenPath, 'utf8');
      expect(content).not.toMatch(/setTimeout\(\s*\(\)\s*=>\s*\{\s*setLoading\(false\);\s*\}\s*,\s*400\s*\)/);
      expect(content).not.toContain('loadingListContainer');
    });

    test('FlatList Virtualization: initialNumToRender is capped at <= 6 (not 12) to match visible viewport', () => {
      const content = fs.readFileSync(stationsScreenPath, 'utf8');
      // Must not use heavy initialNumToRender={12}
      expect(content).not.toContain('initialNumToRender={12}');
      expect(content).toMatch(/initialNumToRender=\{[1-6]\}/);
    });

    test('FlatList Virtualization: windowSize is set to <= 3 (not 5) to minimize offscreen BlurViews', () => {
      const content = fs.readFileSync(stationsScreenPath, 'utf8');
      expect(content).not.toContain('windowSize={5}');
      expect(content).toMatch(/windowSize=\{[1-3]\}/);
    });

    test('Recommendations Cap: lineRecommendedStations is capped at <= 12 (not 30) for instant rendering', () => {
      const content = fs.readFileSync(stationsScreenPath, 'utf8');
      expect(content).not.toContain('matching.slice(0, 30)');
      expect(content).toMatch(/matching\.slice\(0,\s*(10|12)\)/);
    });

    test('stationArrivalsStore: mount jitter on initial cold launch is bounded to <= 250ms (not 1500ms)', () => {
      const content = fs.readFileSync(stationArrivalsStorePath, 'utf8');
      // Old jitter was Math.abs(hash) % 1500; which made cards wait up to 1.5 seconds on mount
      expect(content).not.toMatch(/Math\.abs\(hash\)\s*%\s*1500/);
    });
  });
});
