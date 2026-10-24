import { cleanup } from '@testing-library/react';
import { randomUUID } from 'node:crypto';

Object.defineProperty(globalThis, 'structuredClone', {
  configurable: true,
  value: <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T,
});
Object.defineProperty(globalThis.crypto, 'randomUUID', {
  configurable: true,
  value: randomUUID,
});
globalThis.fetch = jest.fn(async () => {
  throw new Error('Unexpected global network request in Operations Web tests.');
});
afterEach(cleanup);
