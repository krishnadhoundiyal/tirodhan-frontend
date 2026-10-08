import { ApiError } from './errors';
export type CustomerCapability =
  | 'principal'
  | 'catalogue'
  | 'slots'
  | 'collections'
  | 'recommendations'
  | 'payment'
  | 'checkout'
  | 'refunds'
  | 'push'
  | 'notifications'
  | 'profile'
  | 'preferences'
  | 'content'
  | 'favourites'
  | 'paymentMethods'
  | 'feedback'
  | 'cancellationCompensation';
export function isDevelopmentPreview(
  development: boolean,
  flag: string | undefined,
) {
  return development && flag === 'true';
}
export function capabilityGate(enabled: ReadonlySet<string>) {
  return (capability: CustomerCapability) => {
    if (!enabled.has(capability)) throw new ApiError(0, 'backendPending');
  };
}
