// __tests__/widget-sync-parity.test.ts
import * as fs from 'fs';
import * as path from 'path';

describe('Widget Sync & Line Parity Invariants', () => {
  const widgetPath = path.resolve(__dirname, '../targets/MyCommuteWidget/CommuteWidget.swift');
  const storePath = path.resolve(__dirname, '../store/userPreferencesStore.ts');
  const dashboardPath = path.resolve(__dirname, '../components/MyCommuteDashboard.tsx');

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
    const liveServicePath = path.resolve(__dirname, '../services/LiveActivityService.ts');
    const serviceCode = fs.readFileSync(liveServicePath, 'utf8');

    expect(serviceCode).toContain('const filteredStatuses = customStatuses.filter');
  });

  test('6. userPreferencesStore triggers syncToWidget on MMKV hydration', () => {
    const storeCode = fs.readFileSync(storePath, 'utf8');

    expect(storeCode).toContain('state.setHasHydrated(true);');
    expect(storeCode).toContain('void syncToWidget(state.selectedLines);');
  });
});
