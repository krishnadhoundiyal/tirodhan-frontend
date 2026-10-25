import { cleanup } from '@testing-library/react';
import { randomUUID } from 'node:crypto';
Object.defineProperty(globalThis, 'structuredClone', {
  configurable: true,
  value: <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T,
});
Object.defineProperty(globalThis.crypto, 'randomUUID', {
  configurable: true,
  value: randomUUID,
});
globalThis.fetch = jest.fn(async () => {
  throw new Error('Unexpected live request in Customer Web tests.');
});
afterEach(cleanup);
