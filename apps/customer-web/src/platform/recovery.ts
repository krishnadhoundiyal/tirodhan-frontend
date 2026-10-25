import { ApiError } from '../parity/api/errors';
import type { SecureCredential } from '../parity/session/store';
export interface CipherRecord {
  key: CryptoKey;
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: ArrayBuffer;
}
export interface RecoveryDatabase {
  get(owner: string): Promise<CipherRecord | undefined>;
  put(owner: string, value: CipherRecord): Promise<void>;
  remove(owner: string): Promise<void>;
}
export function indexedRecoveryDatabase(factory: IDBFactory): RecoveryDatabase {
  let opening: Promise<IDBDatabase> | null = null;
  const open = () =>
    (opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open('tirodhan-customer-command-recovery', 1);
      let expired = false;
      const timer = setTimeout(() => {
        expired = true;
        reject(new ApiError(0, 'configuration'));
      }, 15000);
      request.onupgradeneeded = () =>
        request.result.createObjectStore('encrypted-commands');
      request.onerror = request.onblocked = () => {
        expired = true;
        clearTimeout(timer);
        reject(new ApiError(0, 'configuration'));
      };
      request.onsuccess = () => {
        clearTimeout(timer);
        if (expired) {
          request.result.close();
          return;
        }
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
    }));
  async function transaction<T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('encrypted-commands', mode),
        req = work(tx.objectStore('encrypted-commands'));
      const timer = setTimeout(() => {
        tx.abort();
        reject(new ApiError(0, 'configuration'));
      }, 15000);
      tx.oncomplete = () => {
        clearTimeout(timer);
        resolve(req.result);
      };
      tx.onabort = tx.onerror = () => {
        clearTimeout(timer);
        reject(new ApiError(0, 'configuration'));
      };
    });
  }
  return {
    get: (owner) => transaction('readonly', (s) => s.get(owner)),
    put: async (owner, v) => {
      await transaction('readwrite', (s) => s.put(v, owner));
    },
    remove: async (owner) => {
      await transaction('readwrite', (s) => s.delete(owner));
    },
  };
}
export interface RecoveryLease {
  acquire(owner: string): Promise<() => void>;
}
export function browserLease(locks: LockManager): RecoveryLease {
  return {
    acquire: (owner) =>
      new Promise((resolve, reject) => {
        void locks
          .request(
            `tirodhan:customer:command-recovery:${owner}`,
            { mode: 'exclusive', ifAvailable: true },
            async (lock) => {
              if (!lock) {
                reject(new ApiError(0, 'configuration'));
                return;
              }
              await new Promise<void>((release) => resolve(release));
            },
          )
          .catch(() => reject(new ApiError(0, 'configuration')));
      }),
  };
}
/** Only encrypted address-free command bodies/IDs. Never auth, OTP, household text or GPS.
 * An exclusive Web Lock lasts for this owner's recovery lifetime, fencing other tabs. */
export class EncryptedRecovery {
  #queue: Promise<unknown> = Promise.resolve();
  #release: (() => void) | null = null;
  #data: Record<string, string> | null = null;
  #key: CryptoKey | null = null;
  #stopped = false;
  constructor(
    private owner: string,
    private current: () => boolean,
    private database: RecoveryDatabase,
    private crypto: Crypto,
    private lease: RecoveryLease,
  ) {}
  #assert() {
    if (this.#stopped || !this.current()) throw new ApiError(0, 'cancelled');
  }
  #serial<T>(work: () => Promise<T>): Promise<T> {
    const p = this.#queue.catch(() => {}).then(work);
    this.#queue = p;
    return p;
  }
  async #load() {
    this.#assert();
    if (this.#data) return;
    this.#release ??= await this.lease.acquire(this.owner);
    this.#assert();
    const stored = await this.database.get(this.owner);
    this.#assert();
    if (stored) {
      if (
        stored.key.extractable ||
        stored.key.type !== 'secret' ||
        stored.key.algorithm.name !== 'AES-GCM'
      )
        throw new ApiError(0, 'protocol');
      this.#key = stored.key;
      try {
        const decoded = new TextDecoder().decode(
          await this.crypto.subtle.decrypt(
            {
              name: 'AES-GCM',
              iv: stored.iv,
              additionalData: new TextEncoder().encode(this.owner),
            },
            stored.key,
            stored.ciphertext,
          ),
        );
        this.#assert();
        const data: unknown = JSON.parse(decoded);
        if (
          !data ||
          typeof data !== 'object' ||
          Array.isArray(data) ||
          Object.entries(data).some(
            ([k, v]) =>
              !/^booking$|^payment:[a-f\d-]{36}$/i.test(k) ||
              typeof v !== 'string',
          )
        )
          throw new Error();
        this.#data = data as Record<string, string>;
      } catch {
        throw new ApiError(0, 'protocol');
      }
    } else {
      this.#key = await this.crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
      );
      this.#data = {};
    }
  }
  async #save() {
    this.#assert();
    const iv = this.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await this.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: new TextEncoder().encode(this.owner),
      },
      this.#key!,
      new TextEncoder().encode(JSON.stringify(this.#data)),
    );
    this.#assert();
    await this.database.put(this.owner, { key: this.#key!, iv, ciphertext });
    this.#assert();
  }
  storage(kind: string): SecureCredential {
    if (!/^booking$|^payment:[a-f\d-]{36}$/i.test(kind))
      throw new ApiError(0, 'configuration');
    return {
      get: () =>
        this.#serial(async () => {
          await this.#load();
          return this.#data![kind] ?? null;
        }),
      set: (value) =>
        this.#serial(async () => {
          await this.#load();
          this.#data![kind] = value;
          await this.#save();
        }),
      remove: () =>
        this.#serial(async () => {
          await this.#load();
          delete this.#data![kind];
          await this.#save();
        }),
    };
  }
  dispose(explicitLogout: boolean) {
    this.#stopped = true;
    return this.#serial(async () => {
      try {
        if (explicitLogout) await this.database.remove(this.owner);
      } finally {
        this.#data = null;
        this.#key = null;
        this.#release?.();
        this.#release = null;
      }
    });
  }
}
export function memoryStorage(): SecureCredential {
  let record: string | null = null;
  return {
    get: async () => record,
    set: async (value) => {
      record = value;
    },
    remove: async () => {
      record = null;
    },
  };
}
/** The sole approved browser database boundary: encrypted address-free command recovery. */
export function browserRecovery(
  owner: string,
  current: () => boolean,
): EncryptedRecovery | null {
  if (
    !globalThis.isSecureContext ||
    !globalThis.crypto?.subtle ||
    !navigator.locks ||
    !globalThis.indexedDB
  )
    return null;
  return new EncryptedRecovery(
    owner,
    current,
    indexedRecoveryDatabase(globalThis.indexedDB),
    globalThis.crypto,
    browserLease(navigator.locks),
  );
}
