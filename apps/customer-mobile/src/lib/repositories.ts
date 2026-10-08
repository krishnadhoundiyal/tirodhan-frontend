import { api } from '../api';
import {
  customerApi,
  previewCatalogue,
  requireCustomerCapability,
} from './runtime';
import { createHttpRepositories } from '../features/collection/repository';
import { createDevelopmentRepositories } from '../features/collection/developmentRepositories';
import type { NativeCheckout } from '../features/collection/paymentFlow';
// Replace only after provider configuration and native device validation are complete.
export const nativeCheckout: NativeCheckout | null = null;
export const repositories = previewCatalogue
  ? createDevelopmentRepositories()
  : createHttpRepositories(customerApi, api, requireCustomerCapability);
