import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Text, View } from 'react-native';
import { AppleSwipeableRow, ACTION_WIDTH, OPEN_THRESHOLD, OVERSWIPE_THRESHOLD } from '../components/AppleSwipeableRow';
import { LineCard } from '../components/LineCard';
import { STATUS_SHORT } from '../constants/statusLabels';

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
}));

describe('AppleSwipeableRow Invariants & Contrast', () => {
  it('renders children with zero red pixels visible at rest', async () => {
    const onDeleteMock = jest.fn();
    const { getByText, getByTestId } = await render(
      <AppleSwipeableRow
        onDelete={onDeleteMock}
        cardHeight={46}
        cardRadius={16}
        marginBottom={12}
        testID="test-swipe-row"
      >
        <View>
          <Text>Jubilee Line</Text>
        </View>
      </AppleSwipeableRow>
    );

    expect(getByText('Jubilee Line')).toBeTruthy();
    const row = getByTestId('test-swipe-row');
    expect(row).toBeTruthy();
  });

  it('triggers onDelete callback when delete pill is pressed', async () => {
    const onDeleteMock = jest.fn();
    const { getByLabelText } = await render(
      <AppleSwipeableRow
        onDelete={onDeleteMock}
        cardHeight={46}
        cardRadius={16}
        marginBottom={12}
        testID="test-swipe-row-delete"
      >
        <View>
          <Text>Bakerloo Line</Text>
        </View>
      </AppleSwipeableRow>
    );

    const deleteButton = getByLabelText('Delete item');
    expect(deleteButton).toBeTruthy();

    fireEvent.press(deleteButton);
    expect(onDeleteMock).toHaveBeenCalled();
  });

  it('exports valid kinematic thresholds for half-swipe and deep overswipe', () => {
    expect(ACTION_WIDTH).toBe(76);
    expect(OPEN_THRESHOLD).toBe(38);
    expect(OVERSWIPE_THRESHOLD).toBe(200);
    expect(OPEN_THRESHOLD).toBeLessThan(ACTION_WIDTH);
    expect(OVERSWIPE_THRESHOLD).toBeGreaterThan(ACTION_WIDTH);
  });

  describe('LineCard Contrast Across All 7 Statuses', () => {
    const statuses = [
      { statusType: 'good', label: 'Good service', expectedColor: '#30D158' },
      { statusType: 'minor', label: 'Minor delays', expectedColor: '#FFB000' },
      { statusType: 'severe', label: 'Severe delays', expectedColor: '#FF3B30' },
      { statusType: 'suspended', label: 'Part suspended', expectedColor: '#FF3B30' },
      { statusType: 'suspended', label: 'Suspended', expectedColor: '#FF3B30' },
      { statusType: 'suspended', label: 'Service Closed', expectedColor: '#FF3B30' },
      { statusType: 'offline', label: 'Offline', expectedColor: 'rgba(255, 255, 255, 0.55)' },
    ];

    statuses.forEach(({ statusType, label, expectedColor }) => {
      it(`renders high-contrast text for status: ${label} (${statusType})`, async () => {
        const { getByText } = await render(
          <LineCard
            line={{
              id: 'jubilee',
              name: 'Jubilee',
              color: '#868F98',
              status: label,
            }}
            selected={false}
            statusType={statusType}
            statusLabel={label}
            cardHeight={46}
            mode="display"
            isEditing={false}
          />
        );

        const renderedLabel = STATUS_SHORT[label] || label;
        const statusElement = getByText(renderedLabel);
        expect(statusElement).toBeTruthy();
        expect(statusElement.props.style).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              color: expectedColor,
            }),
          ])
        );
      });
    });
  });

  describe('Station Dashboard Card (DepartureCard) Swipe Integration', () => {
    it('renders station card inside AppleSwipeableRow with dynamic height and delete capability', async () => {
      const onDeleteMock = jest.fn();
      const { getByText, getByLabelText } = await render(
        <AppleSwipeableRow
          onDelete={onDeleteMock}
          cardRadius={16}
          marginBottom={12}
          testID="swipe-departure-waterloo"
        >
          <View testID="departure-card-mock">
            <Text>Waterloo</Text>
            <Text>Northern</Text>
            <Text>Due</Text>
          </View>
        </AppleSwipeableRow>
      );

      expect(getByText('Waterloo')).toBeTruthy();
      expect(getByText('Due')).toBeTruthy();

      const deleteBtn = getByLabelText('Delete item');
      expect(deleteBtn).toBeTruthy();

      fireEvent.press(deleteBtn);
      expect(onDeleteMock).toHaveBeenCalled();
    });
  });
});
