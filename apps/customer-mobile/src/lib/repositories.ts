import { api } from '../api';
import {
  customerApi,
  previewCatalogue,
  requireCustomerCapability,
} from './runtime';
import { createHttpRepositories } from '../features/collection/repository';
import { createDevelopmentRepositories } from '../features/collection/developmentRepositories';
export { nativeCheckout } from '../features/collection/nativeCheckout';
export const repositories = previewCatalogue
  ? createDevelopmentRepositories()
  : createHttpRepositories(customerApi, api, requireCustomerCapability);
