import { lockAppMode, resolveAppMode } from '../lib/appMode';
import { createPreviewNavigation, previewOwner } from '../preview/navigation';

test('only explicit development Expo Go selects screen preview', () => {
  expect(resolveAppMode('SCREEN_PREVIEW', true, true)).toBe('SCREEN_PREVIEW');
});
test.each([
  [true, false],
  [false, true],
  [false, false],
])('screen preview rejects dev=%s / Expo Go=%s', (dev, go) => {
  expect(() => resolveAppMode('SCREEN_PREVIEW', dev, go)).toThrow();
});
test.each([undefined, '', 'NONPROD', 'PRODUCTION'])(
  '%s never selects preview',
  (mode) => {
    for (const dev of [false, true])
      for (const go of [false, true])
        expect(resolveAppMode(mode, dev, go)).toBe(
          mode === 'NONPROD' ? 'NONPROD' : 'PRODUCTION',
        );
  },
);
test.each(['screen_preview', 'true', ' SCREEN_PREVIEW ', 'STAGING'])(
  'invalid %s fails closed',
  (mode) => {
    expect(() => resolveAppMode(mode, true, true)).toThrow(
      'Invalid EXPO_PUBLIC_APP_MODE',
    );
  },
);
test('Fast Refresh cannot change the running mode; a cold runtime can', () => {
  const lock = {};
  lockAppMode('SCREEN_PREVIEW', lock);
  expect(lockAppMode('SCREEN_PREVIEW', lock)).toBe('SCREEN_PREVIEW');
  expect(() => lockAppMode('NONPROD', lock)).toThrow('Fully restart');
  expect(lockAppMode('NONPROD', {})).toBe('NONPROD');
});
test('preview navigation has no customer principal or token interface and reset only changes local ownership', async () => {
  const navigation = createPreviewNavigation();
  const changed = jest.fn();
  const unsubscribe = navigation.subscribe(changed);
  await navigation.bootstrap();
  await navigation.renewIfExpired();
  await navigation.loadPrincipal();
  expect(navigation.getSnapshot()).toMatchObject({
    status: 'signedOut',
    userId: null,
    principal: null,
    principalState: 'idle',
    ownerVersion: 0,
  });
  expect(navigation).not.toHaveProperty('accessToken');
  expect(navigation).not.toHaveProperty('establish');
  expect(navigation).not.toHaveProperty('refresh');
  expect(previewOwner).toBe('screen-preview:synthetic-navigation-only');
  navigation.reset();
  expect(changed).toHaveBeenCalledTimes(1);
  expect(navigation.getSnapshot()).toMatchObject({
    userId: null,
    principal: null,
    ownerVersion: 1,
  });
  unsubscribe();
  navigation.reset();
  expect(changed).toHaveBeenCalledTimes(1);
});
