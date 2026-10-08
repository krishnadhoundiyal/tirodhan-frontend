import { render, fireEvent, screen } from '@testing-library/react-native';
import { Body, Button, StatusCard, Skeleton } from '../components/ui';
import { DraftProvider, useDraft } from '../features/collection/DraftProvider';
import { ApiError } from '../api/errors';
test('disabled CTA does not submit and exposes accessibility state', async () => {
  const submit = jest.fn();
  await render(<Button label="Confirm" disabled onPress={submit} />);
  await fireEvent.press(screen.getByRole('button'));
  expect(submit).not.toHaveBeenCalled();
  expect(screen.getByRole('button').props.accessibilityState.disabled).toBe(
    true,
  );
});
test('loading preserves layout and signals busy state', async () => {
  await render(<Skeleton height={180} />);
  expect(screen.getByLabelText('Loading').props.accessibilityState.busy).toBe(
    true,
  );
});
test('retryable error shows safe copy and retries', async () => {
  const retry = jest.fn();
  await render(
    <StatusCard
      title="Unable to load"
      error={new ApiError(503)}
      retry={retry}
    />,
  );
  await fireEvent.press(screen.getByText('Try again →'));
  expect(retry).toHaveBeenCalledTimes(1);
  expect(
    screen.getByText(
      'The service is temporarily unavailable. Please try again.',
    ),
  ).toBeTruthy();
});
test('empty state supports useful explanatory copy', async () => {
  await render(
    <StatusCard
      title="No saved addresses"
      detail="Add your pickup address to get started."
    />,
  );
  expect(
    screen.getByText('Add your pickup address to get started.'),
  ).toBeTruthy();
});
function DraftHarness() {
  const draft = useDraft();
  return (
    <>
      <Button
        label="Choose address"
        onPress={() =>
          draft.selectAddress({
            address_id: 'id',
            address: 'Pickup address',
            is_default: false,
            status: 'ACTIVE',
            label: 'Home',
            location: null,
            version: 2,
          })
        }
      />
      <Body>{draft.address?.address ?? 'Not selected'}</Body>
      <Button
        label="Toggle flowers"
        onPress={() => draft.toggleCategory('flowers')}
      />
      <Body>{draft.categoryCodes.join(',') || 'No categories'}</Body>
    </>
  );
}
test('selected address and collection categories remain local draft state', async () => {
  await render(
    <DraftProvider>
      <DraftHarness />
    </DraftProvider>,
  );
  await fireEvent.press(screen.getByText('Choose address'));
  expect(screen.getByText('Pickup address')).toBeTruthy();
  await fireEvent.press(screen.getByText('Toggle flowers'));
  expect(screen.getByText('flowers')).toBeTruthy();
  await fireEvent.press(screen.getByText('Toggle flowers'));
  expect(screen.getByText('No categories')).toBeTruthy();
});
