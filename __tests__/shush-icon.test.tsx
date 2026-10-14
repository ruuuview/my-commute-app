import React from 'react';
import { render } from '@testing-library/react-native';
import { ShushIcon } from '../components/ShushIcon';

describe('ShushIcon Component Invariants', () => {
  it('renders successfully with default props', async () => {
    const { getByTestId } = await render(<ShushIcon />);
    const icon = getByTestId('shush-vector-icon');
    expect(icon).toBeTruthy();
  });

  it('renders with custom size and color props', async () => {
    const { getByTestId } = await render(
      <ShushIcon size={24} color="#5E5CE6" testID="custom-shush-icon" />
    );
    const icon = getByTestId('custom-shush-icon');
    expect(icon).toBeTruthy();
  });
});
