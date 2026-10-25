import type { PaymentAttempt } from '../parity/api/contracts';
import type {
  CheckoutParameters,
  PaymentRead,
} from '../parity/api/customer-contracts';
import { ApiError } from '../parity/api/errors';
import type { PreparedCommand } from '../parity/api/transport';
import type { SecureCredential } from '../parity/session/store';
import type { CheckoutPort } from '../platform/checkout';
import { uuid } from '../parity/api/slot-contracts';
interface Port {
  payment(id: string, signal?: AbortSignal): Promise<PaymentRead>;
  checkout(id: string, signal?: AbortSignal): Promise<CheckoutParameters>;
  prepare(id: string, key: string): PreparedCommand<PaymentAttempt>;
}
interface AttemptRecovery {
  requestId: string;
  key: string;
  attemptId?: string;
  launched?: boolean;
}
export class PaymentFlow {
  #flight: Promise<PaymentRead> | null = null;
  #record: AttemptRecovery | null = null;
  constructor(
    private id: string,
    private repo: Port,
    private sdk: CheckoutPort | null,
    private storage: SecureCredential,
    private current: () => boolean,
  ) {}
  #assert(signal: AbortSignal) {
    if (!this.current() || signal.aborted) throw new ApiError(0, 'cancelled');
  }
  async #read(signal: AbortSignal) {
    const p = await this.repo.payment(this.id, signal);
    this.#assert(signal);
    if (p.request_id !== this.id) throw new ApiError(200, 'protocol');
    return p;
  }
  async #restore() {
    const raw = await this.storage.get();
    if (raw) {
      const r: AttemptRecovery = JSON.parse(raw);
      if (
        r.requestId !== this.id ||
        !uuid(r.key) ||
        (r.attemptId !== undefined && !uuid(r.attemptId))
      )
        throw new ApiError(200, 'protocol');
      this.#record = r;
    }
  }
  start(signal: AbortSignal): Promise<PaymentRead> {
    if (!this.#flight) {
      const task = this.#run(signal);
      this.#flight = task;
      void task
        .finally(() => {
          if (this.#flight === task) this.#flight = null;
        })
        .catch(() => {});
    }
    return this.#flight;
  }
  async #run(signal: AbortSignal) {
    this.#assert(signal);
    await this.#restore();
    this.#assert(signal);
    let payment = await this.#read(signal);
    if (payment.status === 'SUCCEEDED') {
      await this.storage.remove();
      return payment;
    }
    if (payment.action === 'WAIT' || payment.action === 'UNAVAILABLE')
      return payment;
    if (!this.sdk?.available()) throw new ApiError(0, 'backendPending');
    // Prove SDK availability before preparing any backend attempt.
    await this.sdk.prepare(signal);
    this.#assert(signal);
    if (payment.expires_at && Date.parse(payment.expires_at) <= Date.now())
      throw new ApiError(409, 'http', 'NOT_ELIGIBLE');
    let attemptId = payment.current_attempt?.payment_attempt_id;
    if (
      payment.action === 'START' &&
      payment.action_reason === 'NEW_PAYMENT' &&
      payment.current_attempt?.status === 'FAILED'
    ) {
      // Backend explicitly excludes a definitively rejected initial order. It alone
      // authorizes a fresh preparation identity; uncertainty never enters this path.
      if (this.#record?.attemptId === attemptId) this.#record = null;
      attemptId = undefined;
    }
    if (payment.action === 'START' && !attemptId) {
      this.#record ??= { requestId: this.id, key: crypto.randomUUID() };
      await this.storage.set(JSON.stringify(this.#record));
      this.#assert(signal);
      const attempt = await this.repo
        .prepare(this.id, this.#record.key)
        .execute(signal);
      this.#assert(signal);
      this.#record = { ...this.#record, attemptId: attempt.payment_attempt_id };
      await this.storage.set(JSON.stringify(this.#record));
      if (attempt.action === 'WAIT' || attempt.action === 'UNAVAILABLE')
        return this.#read(signal);
      attemptId = attempt.payment_attempt_id;
    }
    if (!attemptId) throw new ApiError(200, 'protocol');
    if (this.#record?.attemptId && this.#record.attemptId !== attemptId) {
      if (this.#record.launched)
        throw new ApiError(409, 'http', 'NOT_ELIGIBLE');
    }
    if (this.#record?.launched) return this.#read(signal); // A callback/lost response never authorizes another automatic launch.
    const parameters = await this.repo.checkout(attemptId, signal);
    this.#assert(signal);
    if (
      parameters.request_id !== this.id ||
      parameters.payment_attempt_id !== attemptId ||
      parameters.amount_minor !== payment.amount_minor ||
      parameters.currency !== payment.currency ||
      parameters.provider !== 'RAZORPAY' ||
      Date.parse(parameters.expires_at) <= Date.now() ||
      Date.parse(parameters.checkout_ready_until) <= Date.now()
    )
      throw new ApiError(200, 'protocol');
    this.#record = {
      requestId: this.id,
      key: this.#record?.key ?? crypto.randomUUID(),
      attemptId,
      launched: true,
    };
    await this.storage.set(JSON.stringify(this.#record));
    this.#assert(signal);
    try {
      await this.sdk.launch(parameters, signal);
    } catch {
      /* Callback dismissal/error carries no financial truth. */
    }
    this.#assert(signal);
    payment = await this.#read(signal);
    if (payment.status === 'SUCCEEDED') await this.storage.remove();
    return payment;
  }
  async resumeExplicitly(signal: AbortSignal) {
    const p = await this.#read(signal);
    if (p.action !== 'RESUME' && p.action !== 'START') return p;
    await this.#restore();
    if (this.#record) {
      this.#record.launched = false;
      await this.storage.set(JSON.stringify(this.#record));
    }
    return this.start(signal);
  }
}
/** Finite verification, stopped on hidden/abort/navigation, terminal result or any error. */
export async function verifyPayment(
  read: (signal: AbortSignal) => Promise<PaymentRead>,
  signal: AbortSignal,
  visible: () => boolean,
  onResult: (p: PaymentRead) => void,
  options = { attempts: 6, intervalMs: 5000 },
) {
  const bounded = new AbortController();
  const abort = () => bounded.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const deadline = setTimeout(abort, 30000);
  try {
    for (let n = 0; n < options.attempts; n++) {
      if (bounded.signal.aborted || !visible()) return;
      const p = await new Promise<PaymentRead | null>((resolve, reject) => {
        const stop = () => resolve(null);
        bounded.signal.addEventListener('abort', stop, { once: true });
        void Promise.resolve()
          .then(() => read(bounded.signal))
          .then(resolve, reject)
          .finally(() => bounded.signal.removeEventListener('abort', stop));
      });
      if (!p || bounded.signal.aborted || !visible()) return;
      onResult(p);
      if (!['PENDING', 'PROCESSING', 'CONFIRMING'].includes(p.status)) return;
      if (n + 1 < options.attempts)
        await new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer);
            bounded.signal.removeEventListener('abort', done);
            resolve();
          };
          const timer = setTimeout(done, options.intervalMs);
          bounded.signal.addEventListener('abort', done, { once: true });
        });
    }
  } finally {
    clearTimeout(deadline);
    signal.removeEventListener('abort', abort);
    bounded.abort();
  }
}
