import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import fs from 'fs';
import path from 'path';
import { DepartureCard } from '../components/DepartureCard';
import { StationCard } from '../components/StationCard';
import * as apiService from '../services/apiService';
import { useLineDataStore } from '../store/lineDataStore';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { resetArrivalsStoreForTesting } from '../services/stationArrivalsStore';

// Mock apiService
jest.mock('../services/apiService', () => {
  const actual = jest.requireActual('../services/apiService');
  return {
    ...actual,
    fetchNormalizedStationArrivals: jest.fn(),
  };
});

describe('DepartureCard & Unified Commute Card Invariants', () => {
  const departureCardPath = path.resolve(__dirname, '../components/DepartureCard.tsx');
  const stationCardPath = path.resolve(__dirname, '../components/StationCard.tsx');

  const mockStation = {
    id: '940GZZLUBNK',
    name: 'Bank',
    lines: ['central', 'northern'],
    zone: 1,
  };

  beforeEach(() => {
    resetArrivalsStoreForTesting();
    jest.clearAllMocks();
    useUserPreferencesStore.setState({
      selectedLines: ['central', 'northern'],
      hasCompletedOnboarding: false,
    });
    useLineDataStore.getState().clearStore();
  });

  // ── Source Invariant Guards ──────────────────────────────────────────
  test('Poka-Yoke: Mock generators do not exist in DepartureCard or StationCard source', () => {
    const depContent = fs.readFileSync(departureCardPath, 'utf8');
    const stContent = fs.readFileSync(stationCardPath, 'utf8');

    expect(depContent).not.toContain('generateMockDepartures');
    expect(depContent).not.toContain('LINE_TERMINALS');
    expect(depContent).not.toContain('getSeedOffset');

    expect(stContent).not.toContain('generateMockDepartures');
    expect(stContent).not.toContain('LINE_TERMINALS');
    expect(stContent).not.toContain('getSeedOffset');
  });

  test('Gate 6 Poka-Yoke: Zero blame copy "Couldn\'t load arrivals" across all components', () => {
    const depContent = fs.readFileSync(departureCardPath, 'utf8');
    const stContent = fs.readFileSync(stationCardPath, 'utf8');

    expect(depContent).not.toContain("Couldn't load arrivals");
    expect(stContent).not.toContain("Couldn't load arrivals");
  });

  test('Zero Truncation Invariant: DepartureCard uses fluid font scaling and zero tail ellipsis', () => {
    const depContent = fs.readFileSync(departureCardPath, 'utf8');

    expect(depContent).toContain('adjustsFontSizeToFit');
    expect(depContent).toContain('minimumFontScale={0.75}');
    expect(depContent).not.toMatch(/stationName[^>]*ellipsizeMode="tail"/);
  });

  test('Typography Invariant: Departure countdowns enforce tabular-nums to eliminate digit jitter', () => {
    const depContent = fs.readFileSync(departureCardPath, 'utf8');
    expect(depContent).toContain("fontVariant: ['tabular-nums']");
  });

  test('Timezone Invariant: Night Tube explicitly evaluates Europe/London timezone', () => {
    const depContent = fs.readFileSync(departureCardPath, 'utf8');
    expect(depContent).toContain("timeZone: 'Europe/London'");
  });

  // ── State 1: Closed Overnight / Service Closed ───────────────────────
  test('State 1: When line status is "Service Closed", renders "Service closed" with zero fabricated rows', async () => {
    useLineDataStore.getState().setLines([
      { id: 'central', name: 'Central', color: '#E32012', status: 'Service Closed', status_severity: 20 },
      { id: 'northern', name: 'Northern', color: '#000000', status: 'Service Closed', status_severity: 20 },
    ]);

    (apiService.fetchNormalizedStationArrivals as jest.Mock).mockResolvedValueOnce({
      id: '940GZZLUBNK',
      name: 'Bank',
      departures: [],
    });

    const { getByText, queryByText, queryByTestId } = await render(
      <DepartureCard
        stationId={mockStation.id}
        stationName={mockStation.name}
        lines={mockStation.lines}
      />
    );

    await waitFor(() => {
      expect(getByText('Service closed')).toBeTruthy();
    });

    // Structural guard: ledger table is not rendered
    expect(queryByTestId('ledger-table')).toBeNull();
    // Zero fabricated platform or countdown strings
    expect(queryByText(/\bPlatform\s+\d+\b/i)).toBeNull();
    expect(queryByText(/\b\d+\s*min\b/i)).toBeNull();
  });

  // ── State 2: Open with Zero Trains Due ──────────────────────────────
  test('State 2: When line status is "Good Service" and arrivals return 0, renders "No trains due"', async () => {
    useLineDataStore.getState().setLines([
      { id: 'central', name: 'Central', color: '#E32012', status: 'Good Service', status_severity: 10 },
      { id: 'northern', name: 'Northern', color: '#000000', status: 'Good Service', status_severity: 10 },
    ]);

    (apiService.fetchNormalizedStationArrivals as jest.Mock).mockResolvedValueOnce({
      id: '940GZZLUBNK',
      name: 'Bank',
      departures: [],
    });

    const { getByText, queryByText, queryByTestId } = await render(
      <DepartureCard
        stationId={mockStation.id}
        stationName={mockStation.name}
        lines={mockStation.lines}
      />
    );

    await waitFor(() => {
      expect(getByText('No trains due')).toBeTruthy();
    });

    expect(queryByText('Service closed')).toBeNull();
    expect(queryByText("Couldn't load arrivals")).toBeNull();
    expect(queryByTestId('ledger-table')).toBeNull();
    expect(queryByText(/\bPlatform\s+\d+\b/i)).toBeNull();
    expect(queryByText(/\b\d+\s*min\b/i)).toBeNull();
  });

  // ── State 3: Disruption Truthfulness ────────────────────────────────
  test('State 3: When line status is disrupted (e.g. "Planned Closure"), displays official TfL status string', async () => {
    useLineDataStore.getState().setLines([
      { id: 'central', name: 'Central', color: '#E32012', status: 'Planned Closure', status_severity: 4 },
      { id: 'northern', name: 'Northern', color: '#000000', status: 'Good Service', status_severity: 10 },
    ]);

    (apiService.fetchNormalizedStationArrivals as jest.Mock).mockResolvedValueOnce({
      id: '940GZZLUBNK',
      name: 'Bank',
      departures: [],
    });

    const { getByText, queryByText, queryByTestId } = await render(
      <DepartureCard
        stationId={mockStation.id}
        stationName={mockStation.name}
        lines={mockStation.lines}
      />
    );

    await waitFor(() => {
      // Must display TfL's official status string
      expect(getByText('Central: Planned Closure')).toBeTruthy();
    });

    expect(queryByText('Service closed')).toBeNull();
    expect(queryByText('No trains due')).toBeNull();
    expect(queryByTestId('ledger-table')).toBeNull();
  });

  // ── State 4: Cold launch zero signal with 0 cache ───────────────────
  test('State 4: When cold launch fetch fails with zero cache, renders "Waiting for signal..."', async () => {
    useLineDataStore.getState().setLines([
      { id: 'central', name: 'Central', color: '#E32012', status: 'Good Service', status_severity: 10 },
      { id: 'northern', name: 'Northern', color: '#000000', status: 'Good Service', status_severity: 10 },
    ]);

    (apiService.fetchNormalizedStationArrivals as jest.Mock).mockRejectedValueOnce(
      new Error('Cellular network down')
    );

    const { getByText, queryByText, queryByTestId } = await render(
      <DepartureCard
        stationId={mockStation.id}
        stationName={mockStation.name}
        lines={mockStation.lines}
      />
    );

    await waitFor(() => {
      expect(getByText('Waiting for signal...')).toBeTruthy();
    });

    expect(queryByText("Couldn't load arrivals")).toBeNull();
    expect(queryByText('No trains due')).toBeNull();
    expect(queryByText('Service closed')).toBeNull();
    expect(queryByTestId('ledger-table')).toBeNull();
  });

  // ── State 5: Real Departures Present (Happy Path) ───────────────────
  test('State 5: When real departures are returned, renders genuine rows and tabular-nums countdowns', async () => {
    useLineDataStore.getState().setLines([
      { id: 'central', name: 'Central', color: '#E32012', status: 'Good Service', status_severity: 10 },
    ]);

    (apiService.fetchNormalizedStationArrivals as jest.Mock).mockResolvedValueOnce({
      id: '940GZZLUBNK',
      name: 'Bank',
      departures: [
        {
          lineId: 'central',
          lineName: 'Central',
          lineColor: '#E32012',
          destination: 'Epping',
          minutesAway: 3,
          platform: 'Platform 2',
          expectedArrival: new Date().toISOString(),
          line: 'Central',
          minutes_away: 3,
          expected_arrival: new Date().toISOString(),
        },
      ],
    });

    const { getByText, queryByText, getByTestId } = await render(
      <DepartureCard
        stationId={mockStation.id}
        stationName={mockStation.name}
        lines={mockStation.lines}
      />
    );

    await waitFor(() => {
      expect(getByText('Epping')).toBeTruthy();
      expect(getByText('P2')).toBeTruthy();
      expect(getByText('3 min')).toBeTruthy();
    });

    expect(getByTestId('ledger-table')).toBeTruthy();
    expect(queryByText('No trains due')).toBeNull();
    expect(queryByText('Service closed')).toBeNull();
    expect(queryByText('Waiting for signal...')).toBeNull();
  });

  // ── StationCard Backwards Compatibility ────────────────────────────
  test('StationCard compatibility: renders "Service closed" when lines are closed (code 20)', async () => {
    useLineDataStore.getState().setLines([
      { id: 'central', name: 'Central', color: '#E32012', status: 'Service Closed', status_severity: 20 },
      { id: 'northern', name: 'Northern', color: '#000000', status: 'Service Closed', status_severity: 20 },
    ]);

    const { getByText, queryByTestId } = await render(
      <StationCard station={mockStation} mode="dashboard" showLedger={true} departures={[]} />
    );

    expect(getByText('Service closed')).toBeTruthy();
    expect(queryByTestId('ledger-table')).toBeNull();
  });

  test('StationCard compatibility: renders "Waiting for signal..." on cold fetch error', async () => {
    useLineDataStore.getState().setLines([
      { id: 'central', name: 'Central', color: '#E32012', status: 'Good Service', status_severity: 10 },
      { id: 'northern', name: 'Northern', color: '#000000', status: 'Good Service', status_severity: 10 },
    ]);

    (apiService.fetchNormalizedStationArrivals as jest.Mock).mockRejectedValueOnce(
      new Error('Failed to fetch from backend or TfL')
    );

    const { getByText, queryByText, queryByTestId } = await render(
      <StationCard station={mockStation} mode="dashboard" showLedger={true} />
    );

    await waitFor(() => {
      expect(getByText('Waiting for signal...')).toBeTruthy();
    });

    expect(queryByTestId('ledger-table')).toBeNull();
    expect(queryByText('Service closed')).toBeNull();
    expect(queryByText('No trains due')).toBeNull();
  });
});
