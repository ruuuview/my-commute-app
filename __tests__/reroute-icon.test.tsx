import React from 'react';
import { render } from '@testing-library/react-native';
import { RerouteIcon } from '../components/RerouteIcon';

describe('RerouteIcon Component Invariants', () => {
  it('renders successfully with default props', async () => {
    const { getByTestId } = await render(<RerouteIcon />);
    const icon = getByTestId('reroute-signpost-icon');
    expect(icon).toBeTruthy();
  });

  it('renders with custom size and color props', async () => {
    const { getByTestId } = await render(
      <RerouteIcon size={24} color="#00FFFF" testID="custom-reroute-icon" />
    );
    const icon = getByTestId('custom-reroute-icon');
    expect(icon).toBeTruthy();
  });

  it('renders successfully with bespoke Lumina photo tile variant', async () => {
    const { getByTestId } = await render(
      <RerouteIcon size={32} variant="tile" testID="reroute-tile-icon" />
    );
    const icon = getByTestId('reroute-tile-icon');
    expect(icon).toBeTruthy();
  });
});
