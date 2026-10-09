import { notificationDispatcher } from '../notifications/signals';
test('foreground push re-fetches authoritative state', () => {
  const refetch = jest.fn();
  const navigate = jest.fn();
  notificationDispatcher(refetch, navigate).foreground({
    identifier: 'id',
    data: { status: 'COMPLETED' },
  });
  expect(refetch).toHaveBeenCalledTimes(1);
  expect(navigate).not.toHaveBeenCalled();
});
test('tap navigates to Activity and fetches without trusting a stale payload', () => {
  const refetch = jest.fn();
  const navigate = jest.fn();
  notificationDispatcher(refetch, navigate).tap({
    identifier: 'old',
    data: {
      status: 'COMPLETED',
      url: 'https://untrusted.example',
      address: 'forbidden',
    },
  });
  expect(refetch).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith('/activity');
});
test('duplicates tolerate delivery and navigation is bounded', () => {
  const refetch = jest.fn();
  const navigate = jest.fn();
  const dispatcher = notificationDispatcher(refetch, navigate);
  const signal = { identifier: 'same', data: {} };
  dispatcher.tap(signal);
  dispatcher.tap(signal);
  expect(refetch).toHaveBeenCalledTimes(2);
  expect(navigate).toHaveBeenCalledTimes(1);
});
test('future verified payload adapter can dispatch only the allowed route', () => {
  const adapter = { destination: jest.fn(() => '/activity' as const) };
  const navigate = jest.fn();
  notificationDispatcher(jest.fn(), navigate, adapter).tap({
    identifier: 'id',
    data: { request_id: 'id' },
  });
  expect(adapter.destination).toHaveBeenCalledWith({ request_id: 'id' });
  expect(navigate).toHaveBeenCalledWith('/activity');
});
