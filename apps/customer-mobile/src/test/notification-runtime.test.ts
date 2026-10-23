import { isRunningInExpoGo } from 'expo';
import {
  logout,
  previewCatalogue,
  pushLifecycle,
  session,
} from '../lib/runtime';

jest.mock('expo', () => ({ isRunningInExpoGo: jest.fn(() => false) }));
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'test-command-id'),
}));
jest.mock('../session/secure', () => ({
  secureCredential: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
  },
}));

beforeEach(() => {
  jest.mocked(isRunningInExpoGo).mockReturnValue(false);
  jest.spyOn(pushLifecycle, 'revoke').mockResolvedValue(undefined);
  jest.spyOn(session, 'clear').mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());

test('Expo Go logout skips push revocation while still clearing the real session', async () => {
  expect(previewCatalogue).toBe(false);
  jest.mocked(isRunningInExpoGo).mockReturnValue(true);
  await logout();
  expect(pushLifecycle.revoke).not.toHaveBeenCalled();
  expect(session.clear).toHaveBeenCalledTimes(1);
});

test('normal native development logout retains push revocation', async () => {
  await logout();
  expect(pushLifecycle.revoke).toHaveBeenCalledTimes(1);
  expect(session.clear).toHaveBeenCalledTimes(1);
});
