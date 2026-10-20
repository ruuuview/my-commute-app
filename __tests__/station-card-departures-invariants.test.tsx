import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import fs from 'fs';
import path from 'path';
import { StationCard } from '../components/StationCard';
import * as apiService from '../services/apiService';
import { useLineDataStore } from '../store/lineDataStore';
import { useUserPreferencesStore } from '../store/userPreferencesStore';

// Mock apiService
jest.mock('../services/apiService', () => {
  const actual = jest.requireActual('../services/apiService');
  return {
    ...actual,
    fetchNormalizedStationArrivals: jest.fn(),
  };
});

describe('StationCard Departures & Zero-Fabrication Invariants', () => {
  const stationCardPath = path.resolve(__dirname, '../components/StationCard.tsx');

  const mockStation = {
    id: '940GZZLUBNK',
    name: 'Bank',
    lines: ['central', 'northern'],
    zone: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useUserPreferencesStore.setState({
      selectedLines: ['central', 'northern'],
      hasCompletedOnboarding: false,
    });
    useLineDataStore.getState().clearStore();
  });

  // ── Source Invariant Guard ──────────────────────────────────────────
  test('Poka-Yoke: generateMockDepartures, LINE_TERMINALS, getSeedOffset do not exist in StationCard source', () => {
    const content = fs.readFileSync(stationCardPath, 'utf8');
    expect(content).not.toContain('generateMockDepartures');
    expect(content).not.toContain('LINE_TERMINALS');
    expect(content).not.toContain('getSeedOffset');
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
      <StationCard station={mockStation} mode="onboarding" showLedger={true} />
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
      <StationCard station={mockStation} mode="onboarding" showLedger={true} />
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

  // ── State 3: Failed Fetch / Network Drop (Even with Good Service) ──
  test('State 3: When line status is "Good Service" but arrivals fetch fails, renders "Couldn\'t load arrivals"', async () => {
    useLineDataStore.getState().setLines([
      { id: 'central', name: 'Central', color: '#E32012', status: 'Good Service', status_severity: 10 },
      { id: 'northern', name: 'Northern', color: '#000000', status: 'Good Service', status_severity: 10 },
    ]);

    (apiService.fetchNormalizedStationArrivals as jest.Mock).mockRejectedValueOnce(
      new Error('Network request failed')
    );

    const { getByText, queryByText, queryByTestId } = await render(
      <StationCard station={mockStation} mode="onboarding" showLedger={true} />
    );

    await waitFor(() => {
      expect(getByText("Couldn't load arrivals")).toBeTruthy();
    });

    expect(queryByText('No trains due')).toBeNull();
    expect(queryByText('Service closed')).toBeNull();
    expect(queryByTestId('ledger-table')).toBeNull();
    expect(queryByText(/\bPlatform\s+\d+\b/i)).toBeNull();
    expect(queryByText(/\b\d+\s*min\b/i)).toBeNull();
  });

  // ── State 4: Real Departures Present (Happy Path) ───────────────────
  test('State 4: When real departures are returned, renders genuine rows and no empty state text', async () => {
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
      <StationCard station={mockStation} mode="onboarding" showLedger={true} />
    );

    await waitFor(() => {
      expect(getByText('Epping')).toBeTruthy();
      expect(getByText('Platform 2')).toBeTruthy();
      expect(getByText('3 min')).toBeTruthy();
    });

    expect(getByTestId('ledger-table')).toBeTruthy();
    expect(queryByText('No trains due')).toBeNull();
    expect(queryByText('Service closed')).toBeNull();
    expect(queryByText("Couldn't load arrivals")).toBeNull();
  });

  // ── Planned Closure Guard ──────────────────────────────────────────
  test('Planned Closure Guard: Planned Closure on one line does NOT produce "Service closed"', async () => {
    // One line has Planned Closure (code 4), another has Good Service (code 10)
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
      <StationCard station={mockStation} mode="onboarding" showLedger={true} />
    );

    await waitFor(() => {
      // Must NOT claim "Service closed"
      expect(queryByText('Service closed')).toBeNull();
      // Must truthfully show "No trains due" since fetch succeeded with 0
      expect(getByText('No trains due')).toBeTruthy();
      // Structural guard: ledger table is not rendered
      expect(queryByTestId('ledger-table')).toBeNull();
      // Zero fabricated platform or countdown strings
      expect(queryByText(/\bPlatform\s+\d+\b/i)).toBeNull();
      expect(queryByText(/\b\d+\s*min\b/i)).toBeNull();
    });
  });

  test('Planned Closure Guard: Planned Closure on ALL serving lines does NOT produce "Service closed"', async () => {
    // Both lines have Planned Closure (code 4)
    useLineDataStore.getState().setLines([
      { id: 'central', name: 'Central', color: '#E32012', status: 'Planned Closure', status_severity: 4 },
      { id: 'northern', name: 'Northern', color: '#000000', status: 'Planned Closure', status_severity: 4 },
    ]);

    (apiService.fetchNormalizedStationArrivals as jest.Mock).mockResolvedValueOnce({
      id: '940GZZLUBNK',
      name: 'Bank',
      departures: [],
    });

    const { getByText, queryByText, queryByTestId } = await render(
      <StationCard station={mockStation} mode="onboarding" showLedger={true} />
    );

    await waitFor(() => {
      // Must NOT claim "Service closed" even when all serving lines have Planned Closure
      expect(queryByText('Service closed')).toBeNull();
      // Must truthfully show "No trains due" since fetch succeeded with 0
      expect(getByText('No trains due')).toBeTruthy();
      // Structural guard: ledger table is not rendered
      expect(queryByTestId('ledger-table')).toBeNull();
      // Zero fabricated platform or countdown strings
      expect(queryByText(/\bPlatform\s+\d+\b/i)).toBeNull();
      expect(queryByText(/\b\d+\s*min\b/i)).toBeNull();
    });
  });

  // ── Dashboard Mode Tests ───────────────────────────────────────────
  test('Dashboard mode: renders "Service closed" when lines are closed (code 20)', async () => {
    useLineDataStore.getState().setLines([
      { id: 'central', name: 'Central', color: '#E32012', status: 'Service Closed', status_severity: 20 },
      { id: 'northern', name: 'Northern', color: '#000000', status: 'Service Closed', status_severity: 20 },
    ]);

    const { getByText, queryByText, queryByTestId } = await render(
      <StationCard station={mockStation} mode="dashboard" showLedger={true} departures={[]} />
    );

    expect(getByText('Service closed')).toBeTruthy();
    expect(queryByTestId('ledger-table')).toBeNull();
    expect(queryByText(/\bPlatform\s+\d+\b/i)).toBeNull();
    expect(queryByText(/\b\d+\s*min\b/i)).toBeNull();
  });

  test('Dashboard mode: renders "Couldn\'t load arrivals" when lines are open and live fetch fails', async () => {
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
      expect(getByText("Couldn't load arrivals")).toBeTruthy();
    });

    expect(queryByTestId('ledger-table')).toBeNull();
    expect(queryByText('Service closed')).toBeNull();
    expect(queryByText('No trains due')).toBeNull();
    expect(queryByText(/\bPlatform\s+\d+\b/i)).toBeNull();
    expect(queryByText(/\b\d+\s*min\b/i)).toBeNull();
  });

  test('Dashboard mode: renders "Couldn\'t load arrivals" when fetchError prop is passed as true', async () => {
    useLineDataStore.getState().setLines([
      { id: 'central', name: 'Central', color: '#E32012', status: 'Good Service', status_severity: 10 },
      { id: 'northern', name: 'Northern', color: '#000000', status: 'Good Service', status_severity: 10 },
    ]);

    const { getByText, queryByText, queryByTestId } = await render(
      <StationCard station={mockStation} mode="dashboard" showLedger={true} fetchError={true} departures={[]} />
    );

    expect(getByText("Couldn't load arrivals")).toBeTruthy();
    expect(queryByTestId('ledger-table')).toBeNull();
    expect(queryByText('Service closed')).toBeNull();
    expect(queryByText('No trains due')).toBeNull();
    expect(queryByText(/\bPlatform\s+\d+\b/i)).toBeNull();
    expect(queryByText(/\b\d+\s*min\b/i)).toBeNull();
  });
});
