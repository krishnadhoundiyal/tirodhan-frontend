import { riderMode, repositoryForMode } from '../configuration';
import { createFixtureRepository } from '../features/fixtures';
test('fixture repository never falls back to live calls for any read or mutation', async () => {
  const live = {
    availability: jest.fn(),
    setAvailability: jest.fn(),
    offers: jest.fn(),
    accept: jest.fn(),
    assignment: jest.fn(),
    route: jest.fn(),
  };
  const fixture = createFixtureRepository();
  const repository = repositoryForMode(
    riderMode(true, 'SCREEN_PREVIEW'),
    live,
    fixture.repository,
  );
  await repository.availability();
  await repository.offers();
  await repository.assignment();
  await repository.route();
  await repository.setAvailability('AVAILABLE', 1);
  await repository.accept('demo-offer');
  Object.values(live).forEach((call) => expect(call).not.toHaveBeenCalled());
});
test('live mode never fills empty/error responses with development data', async () => {
  const fixture = createFixtureRepository();
  const live = {
    ...fixture.repository,
    offers: jest.fn(async () => []),
    assignment: jest.fn(async () => ({ assignment: null })),
  };
  const repository = repositoryForMode(
    riderMode(false, 'LIVE'),
    live,
    fixture.repository,
  );
  expect(repository).toBe(live);
  expect(await repository.offers()).toEqual([]);
  expect(await repository.assignment()).toEqual({ assignment: null });
});
test('release fixture mode and unknown mode fail closed', () => {
  expect(() => riderMode(false, 'SCREEN_PREVIEW')).toThrow();
  expect(() => riderMode(true, 'PREVEIW')).toThrow();
  expect(riderMode(true, undefined)).toBe('LIVE');
});
test('development offers respect OFFLINE intent instead of fabricating eligible acceptance', async () => {
  const fixture = createFixtureRepository();
  await fixture.repository.setAvailability('OFFLINE', 1);
  await expect(fixture.repository.accept('demo-offer')).rejects.toMatchObject({
    status: 409,
  });
  expect(await fixture.repository.assignment()).toEqual({ assignment: null });
});
