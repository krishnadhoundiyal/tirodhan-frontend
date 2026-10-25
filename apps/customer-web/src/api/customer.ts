import {
  address,
  addresses,
  addressWrite,
  context,
  CustomerError,
  positive,
  serviceState,
  uuid,
  type Address,
  type AddressWrite,
  type Context,
} from './contracts';
import type { CustomerSession } from '../auth/session';

export interface Prepared<T> {
  readonly owner: string;
  readonly epoch: number;
  readonly key: string;
  readonly path: string;
  readonly body: string | undefined;
  execute(): Promise<T>;
}
export class CustomerApi {
  constructor(readonly session: CustomerSession) {}
  async addresses(signal?: AbortSignal) {
    return addresses(
      await this.session.request(
        '/v1/addresses',
        { method: 'GET' },
        200,
        signal,
      ),
    );
  }
  #prepare<T>(
    path: string,
    method: 'POST' | 'PUT',
    body: unknown,
    success: number,
    decode: (v: unknown) => T,
  ): Prepared<T> {
    const state = this.session.snapshot();
    if (state.phase !== 'ready' || !state.principal)
      throw new CustomerError('unauthorized');
    const owner = state.principal.user_id,
      epoch = state.epoch,
      key = crypto.randomUUID();
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    let running: Promise<T> | null = null;
    const current = () => {
      const now = this.session.snapshot();
      if (
        now.epoch !== epoch ||
        now.principal?.user_id !== owner ||
        now.phase !== 'ready'
      )
        throw new CustomerError('cancelled');
    };
    return Object.freeze({
      owner,
      epoch,
      key,
      path,
      body: serialized,
      execute: () => {
        current();
        if (!running) {
          const task = this.session
            .request(
              path,
              {
                method,
                headers: {
                  'Idempotency-Key': key,
                  ...(serialized === undefined
                    ? {}
                    : { 'Content-Type': 'application/json' }),
                },
                body: serialized,
              },
              success,
            )
            .then((v) => {
              current();
              return decode(v);
            });
          running = task;
          void task
            .finally(() => {
              if (running === task) running = null;
            })
            .catch(() => {});
        }
        return running;
      },
    });
  }
  create(values: AddressWrite) {
    return this.#prepare(
      '/v1/addresses',
      'POST',
      addressWrite(values),
      201,
      (v) => {
        const a = address(v);
        if (a.status !== 'ACTIVE') throw new CustomerError('invalid');
        return a;
      },
    );
  }
  update(existing: Address, values: AddressWrite) {
    return this.#prepare(
      `/v1/addresses/${uuid(existing.address_id)}`,
      'PUT',
      { ...addressWrite(values), expected_version: positive(existing.version) },
      200,
      (v) => {
        const a = address(v);
        if (
          a.address_id !== existing.address_id ||
          a.status !== 'ACTIVE' ||
          a.version <= existing.version
        )
          throw new CustomerError('invalid');
        return a;
      },
    );
  }
  archive(existing: Address) {
    return this.#prepare(
      `/v1/addresses/${uuid(existing.address_id)}/archive`,
      'POST',
      undefined,
      200,
      (v) => {
        const a = address(v);
        if (a.address_id !== existing.address_id || a.status !== 'ARCHIVED')
          throw new CustomerError('invalid');
        return a;
      },
    );
  }
  check(existing: Address) {
    const id = uuid(existing.address_id),
      version = positive(existing.version);
    return this.#prepare(
      '/v1/serviceability/contexts',
      'POST',
      { source_address_id: id },
      201,
      (v) => this.#binding(context(v), id, version),
    );
  }
  #binding(c: Context, id: string, version: number) {
    if (c.source_address_id !== id || c.source_address_version !== version)
      throw new CustomerError('invalid');
    return c;
  }
  async readCheck(c: Context, existing: Address, signal?: AbortSignal) {
    if (
      serviceState(c, existing, Date.now()) === 'changed' ||
      serviceState(c, existing, Date.now()) === 'expired'
    )
      throw new CustomerError('invalid');
    const result = context(
      await this.session.request(
        `/v1/serviceability/contexts/${uuid(c.serviceability_context_id)}`,
        { method: 'GET' },
        200,
        signal,
      ),
    );
    if (result.serviceability_context_id !== c.serviceability_context_id)
      throw new CustomerError('invalid');
    return this.#binding(result, existing.address_id, existing.version);
  }
}
