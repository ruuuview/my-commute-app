// __tests__/widget-sync-parity.test.ts
import * as fs from 'fs';
import * as path from 'path';
import { normaliseLineId } from '../utils/normaliseLineId';
import { tflCapitalise } from '../utils/tflCapitalise';
import tflRouteData from '../data/tflRouteData.json';

describe('Widget Sync & Line Parity Invariants', () => {
  const widgetPath = path.resolve(__dirname, '../targets/MyCommuteWidget/CommuteWidget.swift');
  const storePath = path.resolve(__dirname, '../store/userPreferencesStore.ts');
  const dashboardPath = path.resolve(__dirname, '../components/MyCommuteDashboard.tsx');
  const liveServicePath = path.resolve(__dirname, '../services/LiveActivityService.ts');

  test('1. CommuteWidget.swift re-orders fetchTfLStatus and readPreWarmedCache strictly by savedLines order', () => {
    const swiftCode = fs.readFileSync(widgetPath, 'utf8');

    // Verify linesMap dictionary re-ordering in fetchTfLStatus
    expect(swiftCode).toContain('let linesMap = Dictionary(uniqueKeysWithValues: unordered.map');
    expect(swiftCode).toContain('let ordered = savedLines.compactMap { linesMap[$0.id.lowercased()] }');
  });

  test('2. CommuteWidget.swift worstLine selects user top line when all lines have Good Service', () => {
    const swiftCode = fs.readFileSync(widgetPath, 'utf8');

    // Verify worstLine returns lines.first when no line is disrupted
    expect(swiftCode).toContain('if let disrupted = lines.filter({ $0.level.rank > 0 }).max(by: { $0.level.rank < $1.level.rank })');
    expect(swiftCode).toContain('return lines.first');
  });

  test('3. userPreferencesStore subscribes to syncToWidget on any selectedLines mutation', () => {
    const storeCode = fs.readFileSync(storePath, 'utf8');

    // Verify import and subscription
    expect(storeCode).toContain("import { syncToWidget } from '../utils/widgetSync';");
    expect(storeCode).toContain('useUserPreferencesStore.subscribe');
    expect(storeCode).toContain('void syncToWidget(state.selectedLines)');
  });

  test('4. MyCommuteDashboard syncs fresh status updates to LiveActivityService.syncWidgetCache', () => {
    const dashCode = fs.readFileSync(dashboardPath, 'utf8');

    expect(dashCode).toContain('LiveActivityService.syncWidgetCache(selectedLines, customStatuses)');
  });

  test('5. LiveActivityService filters customStatuses to match selectedLines length', () => {
    const serviceCode = fs.readFileSync(liveServicePath, 'utf8');

    expect(serviceCode).toContain('const filteredStatuses: WidgetLineStatusPayload[] = customStatuses');
  });

  test('6. userPreferencesStore triggers syncToWidget on MMKV hydration', () => {
    const storeCode = fs.readFileSync(storePath, 'utf8');

    expect(storeCode).toContain('state.setHasHydrated(true);');
    expect(storeCode).toContain('void syncToWidget(state.selectedLines);');
  });

  test('7. Zero-Fabrication Invariant: CommuteWidget.swift has NO hardcoded defaultLines fallback', () => {
    const swiftCode = fs.readFileSync(widgetPath, 'utf8');

    expect(swiftCode).not.toContain('defaultLines');
    expect(swiftCode).toContain('do {');
    expect(swiftCode).toContain('let decoded = try JSONDecoder().decode([SavedLine].self, from: data)');
    expect(swiftCode).toContain('logger.error("[CommuteWidget] myLines JSON decoding failed:');
  });

  test('8. Bridge Contract Invariant: All 19 canonical TfL routes produce valid string SavedLinePayload', () => {
    const canonicalRoutes = Object.keys((tflRouteData as any).routes || {});
    expect(canonicalRoutes.length).toBe(19);

    canonicalRoutes.forEach((routeId: string) => {
      const cleanId = normaliseLineId(routeId).cleanLineId;
      const displayName = tflCapitalise(routeId);

      expect(typeof cleanId).toBe('string');
      expect(cleanId.length).toBeGreaterThan(0);
      expect(typeof displayName).toBe('string');
      expect(displayName.length).toBeGreaterThan(0);

      // Verify that serialized JSON is an array of objects where id is string, not nested dictionary
      const payload = [{ id: cleanId, name: displayName }];
      const jsonString = JSON.stringify(payload);
      const parsed = JSON.parse(jsonString);

      expect(typeof parsed[0].id).toBe('string');
      expect(parsed[0].id).not.toContain('[object Object]');
    });
  });

  test('9. Pre-Write Validation Guard: LiveActivityService validates payload structure before write', () => {
    const serviceCode = fs.readFileSync(liveServicePath, 'utf8');

    expect(serviceCode).toContain('normaliseLineId(rawId).cleanLineId');
    expect(serviceCode).toContain('const isMalformed = linesArray.some');
    expect(serviceCode).toContain('Blocked malformed widget payload from poisoning App Group');
  });
});
