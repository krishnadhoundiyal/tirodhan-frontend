import type {
  CheckoutParameters,
  CollectionDetail,
  PaymentRead,
} from '../../api/customer-contracts';
import type { CustomerRepositories } from './repository';
import type { PaymentRecoveryStore } from './paymentRecovery';
import { ApiError } from '../../api/errors';
import {
  futurePaymentDate,
  parseCheckout,
  parsePayment,
  parsePaymentAttempt,
} from '../../api/payment-contracts';

export interface NativeCheckout {
  available?(): boolean;
  launch(parameters: CheckoutParameters, authorize: () => void): Promise<void>;
}
export interface PaymentScope {
  owner: string;
  isCurrent(): boolean;
  recovery: PaymentRecoveryStore | null;
  newId(): string;
  now?(): number;
  monotonicNow?(): number;
  random?(): number;
  verificationWindowMs?: number;
  callbackTimeoutMs?: number;
}
export interface PaymentSnapshot {
  phase: 'idle' | 'preparing' | 'checkout' | 'awaiting';
  busy: boolean;
  payment: PaymentRead | null;
  detail: CollectionDetail | null;
  error: ApiError | null;
  verificationStopped: boolean;
  nativeOutstanding: boolean;
}
export const paymentVerificationWindow = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1000 && n <= 180000 ? n : 180000;
};
const safe = (error: unknown) =>
  error instanceof ApiError ? error : new ApiError(0, 'network');
export function paymentFlow(
  id: string,
  repository: Pick<
    CustomerRepositories,
    'payment' | 'paymentAttempt' | 'checkout' | 'detail'
  >,
  native: NativeCheckout | null,
  scope: PaymentScope,
) {
  let state: PaymentSnapshot = {
    phase: 'idle',
    busy: false,
    payment: null,
    detail: null,
    error: null,
    verificationStopped: false,
    nativeOutstanding: false,
  };
  const listeners = new Set<() => void>();
  const now = scope.now ?? Date.now,
    random = scope.random ?? Math.random;
  const monotonicNow = scope.monotonicNow ?? (() => performance.now());
  const windowMs = paymentVerificationWindow(scope.verificationWindowMs);
  let disposed = false,
    foreground = true,
    deadline = 0,
    step = 0,
    verifyRequested = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let callbackTimer: ReturnType<typeof setTimeout> | null = null;
  let releaseCallbackWait: (() => void) | null = null;
  let abort: AbortController | null = null;
  let flight: Promise<PaymentRead> | null = null,
    refreshFlight: Promise<PaymentRead> | null = null;
  const assertCurrent = () => {
    if (disposed || !scope.isCurrent()) throw new ApiError(401);
  };
  const publish = (patch: Partial<PaymentSnapshot>) => {
    if (disposed || !scope.isCurrent()) return;
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };
  const stopTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const needsVerification = () =>
    state.payment?.status !== 'SUCCEEDED' &&
    (verifyRequested ||
      state.payment?.verification_pending ||
      state.payment?.action === 'WAIT' ||
      ['PROCESSING', 'CONFIRMING'].includes(state.payment?.status ?? ''));
  const beginWindow = () => {
    stopTimer();
    deadline = monotonicNow() + windowMs;
    step = 0;
    publish({ verificationStopped: false });
  };
  const schedule = () => {
    if (
      disposed ||
      !scope.isCurrent() ||
      !foreground ||
      !deadline ||
      !needsVerification()
    ) {
      stopTimer();
      return;
    }
    if (timer) return;
    const remaining = deadline - monotonicNow();
    if (remaining <= 0) {
      publish({ verificationStopped: true });
      return;
    }
    const delay = Math.min(
      remaining,
      Math.min(15000, 2000 * 2 ** Math.min(step++, 3)) * (0.8 + random() * 0.4),
    );
    timer = setTimeout(() => {
      timer = null;
      if (monotonicNow() >= deadline) {
        publish({ verificationStopped: true });
        return;
      }
      void refresh().catch(() => {});
    }, delay);
  };
  function refresh(): Promise<PaymentRead> {
    if (refreshFlight) return refreshFlight;
    const operation = (async () => {
      assertCurrent();
      if (!foreground) throw new ApiError(0, 'cancelled');
      abort = new AbortController();
      const [paymentResult, detailResult] = await Promise.allSettled([
        repository.payment(id, abort.signal),
        repository.detail(id, abort.signal),
      ]);
      assertCurrent();
      if (!foreground) throw new ApiError(0, 'cancelled');
      let detail: CollectionDetail | null = null;
      if (detailResult.status === 'fulfilled') {
        if (detailResult.value.request_id !== id)
          throw new ApiError(200, 'protocol');
        detail = {
          ...detailResult.value,
          payment: parsePayment(detailResult.value.payment, id),
        };
      }
      if (paymentResult.status === 'rejected') {
        if (detail) publish({ detail });
        throw paymentResult.reason;
      }
      const payment = parsePayment(paymentResult.value, id);
      if (payment.status === 'SUCCEEDED' && scope.recovery)
        void scope.recovery
          .resolve(scope.owner, id, assertCurrent)
          .catch(() => {});
      if (
        payment.status === 'SUCCEEDED' ||
        (payment.action === 'UNAVAILABLE' && !payment.verification_pending)
      )
        verifyRequested = false;
      publish({
        payment,
        ...(detail ? { detail } : {}),
        error:
          detailResult.status === 'rejected' ? safe(detailResult.reason) : null,
      });
      return payment;
    })();
    refreshFlight = operation;
    void operation.then(
      () => {
        if (refreshFlight === operation) {
          refreshFlight = null;
          abort = null;
          schedule();
        }
      },
      (error) => {
        if (refreshFlight === operation) {
          refreshFlight = null;
          abort = null;
          publish({ error: safe(error) });
          schedule();
        }
      },
    );
    return operation;
  }
  const authorize = (parameters: CheckoutParameters) => {
    assertCurrent();
    if (!foreground) throw new ApiError(0, 'cancelled');
    if (
      !futurePaymentDate(parameters.expires_at, now()) ||
      !futurePaymentDate(parameters.checkout_ready_until, now())
    )
      throw new ApiError(409, 'http', 'NOT_ELIGIBLE');
  };
  const run = async (): Promise<PaymentRead> => {
    assertCurrent();
    if (!native || native.available?.() === false)
      throw new ApiError(0, 'backendPending');
    if (!foreground) throw new ApiError(0, 'cancelled');
    const recovery = scope.recovery;
    if (!recovery) throw new ApiError(0, 'preview');
    beginWindow();
    publish({ phase: 'preparing', busy: true, error: null });
    let entered = false;
    try {
      const current = await refresh();
      assertCurrent();
      const detail = state.detail;
      if (
        current.status === 'SUCCEEDED' ||
        current.action === 'UNAVAILABLE' ||
        current.action_reason === 'UNKNOWN'
      )
        return current;
      if (current.action !== 'WAIT' && !current.retry_allowed)
        throw new ApiError(409, 'http', 'NOT_ELIGIBLE');
      if (state.nativeOutstanding) return current;
      if (
        !detail ||
        state.error ||
        detail.status !== 'PENDING_PAYMENT' ||
        detail.payment.status === 'SUCCEEDED' ||
        current.amount_minor <= 0 ||
        current.currency !== 'INR' ||
        current.payment_id !== detail.payment.payment_id ||
        current.amount_minor !== detail.payment.amount_minor ||
        current.currency !== detail.payment.currency ||
        current.currency !== detail.quote.currency ||
        current.amount_minor !== detail.quote.amount_minor ||
        !futurePaymentDate(current.expires_at, now())
      )
        throw new ApiError(409, 'http', 'NOT_ELIGIBLE');
      const command = await recovery.prepare(
        scope.owner,
        id,
        scope.newId,
        assertCurrent,
      );
      assertCurrent();
      verifyRequested = true;
      const attempt = parsePaymentAttempt(
        await repository.paymentAttempt(id, command.commandKey).execute(),
      );
      assertCurrent();
      if (attempt.action === 'UNAVAILABLE') return await refresh();
      const rejectedFirstAttempt =
        attempt.provider === 'RAZORPAY' &&
        attempt.status === 'FAILED' &&
        attempt.provider_order_id === null &&
        attempt.failure_code === 'RAZORPAY_ORDER_REJECTED' &&
        attempt.action === 'START' &&
        attempt.action_reason === 'NEW_PAYMENT';
      await recovery.bind(
        scope.owner,
        command,
        attempt.payment_attempt_id,
        attempt.provider_order_id,
        assertCurrent,
        rejectedFirstAttempt,
      );
      assertCurrent();
      if (rejectedFirstAttempt) {
        verifyRequested = false;
        return await refresh();
      }
      if (attempt.action === 'WAIT') return await refresh();
      if (
        !['START', 'RESUME'].includes(attempt.action) ||
        attempt.action_reason !== 'CHECKOUT_READY' ||
        attempt.provider !== 'RAZORPAY' ||
        attempt.status !== 'PENDING' ||
        !attempt.provider_order_id ||
        !futurePaymentDate(attempt.checkout_ready_until, now())
      )
        throw new ApiError(200, 'protocol');
      const parameters = parseCheckout(
        await repository.checkout(attempt.payment_attempt_id),
      );
      assertCurrent();
      if (
        parameters.request_id !== id ||
        parameters.payment_attempt_id !== attempt.payment_attempt_id ||
        parameters.provider_order_id !== attempt.provider_order_id ||
        parameters.currency !== current.currency ||
        parameters.amount_minor !== current.amount_minor ||
        Date.parse(parameters.expires_at) !== Date.parse(current.expires_at!)
      )
        throw new ApiError(200, 'protocol');
      authorize(parameters);
      entered = true;
      publish({ phase: 'checkout', nativeOutstanding: true });
      let returned = false,
        timedOut = false;
      // Discard provider success/error payloads; all financial confirmation is from backend reads.
      const completion = Promise.resolve()
        .then(() => native.launch(parameters, () => authorize(parameters)))
        .then(
          () => {},
          () => {},
        )
        .then(() => {
          returned = true;
          publish({ nativeOutstanding: false });
          if (timedOut && !disposed && scope.isCurrent() && foreground)
            void refresh().catch(() => {});
        });
      const timeout = new Promise<void>((resolve) => {
        releaseCallbackWait = resolve;
        callbackTimer = setTimeout(
          () => {
            timedOut = !returned;
            resolve();
          },
          Math.min(180000, Math.max(1000, scope.callbackTimeoutMs ?? 60000)),
        );
      });
      await Promise.race([completion, timeout]);
      if (callbackTimer) clearTimeout(callbackTimer);
      callbackTimer = null;
      releaseCallbackWait = null;
      assertCurrent();
      return foreground ? await refresh() : current;
    } catch (error) {
      if (!disposed && scope.isCurrent() && foreground) {
        const reconciled = await refresh().catch(() => null);
        if (reconciled?.status === 'SUCCEEDED') return reconciled;
      }
      throw safe(error);
    } finally {
      if (callbackTimer) clearTimeout(callbackTimer);
      callbackTimer = null;
      publish({
        phase: entered || verifyRequested ? 'awaiting' : 'idle',
        busy: false,
      });
      schedule();
    }
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start(): Promise<PaymentRead> {
      if (!flight) {
        const operation = run();
        flight = operation;
        void operation.then(
          () => {
            if (flight === operation) flight = null;
          },
          (error) => {
            if (flight === operation) {
              flight = null;
              publish({ error: safe(error), busy: false });
            }
          },
        );
      }
      return flight;
    },
    refresh(manual = false) {
      if (manual) beginWindow();
      else if (!deadline) beginWindow();
      return refresh();
    },
    setForeground(active: boolean) {
      foreground = active;
      if (!active) {
        stopTimer();
        abort?.abort();
        return;
      }
      if (!deadline) beginWindow();
      if (refreshFlight && abort?.signal.aborted) {
        void refreshFlight
          .catch(() => {})
          .then(() => {
            if (!disposed && scope.isCurrent() && foreground)
              void refresh().catch(() => {});
          });
      } else void refresh().catch(() => {});
    },
    dispose() {
      disposed = true;
      foreground = false;
      stopTimer();
      if (callbackTimer) clearTimeout(callbackTimer);
      callbackTimer = null;
      releaseCallbackWait?.();
      releaseCallbackWait = null;
      abort?.abort();
      listeners.clear();
    },
  };
}
export type PaymentFlow = ReturnType<typeof paymentFlow>;
const flows = new Map<string, PaymentFlow>();
export function sharedPaymentFlow(key: string, create: () => PaymentFlow) {
  let flow = flows.get(key);
  if (!flow) {
    flow = create();
    flows.set(key, flow);
  }
  return flow;
}
export function clearPaymentFlows() {
  flows.forEach((flow) => flow.dispose());
  flows.clear();
}
