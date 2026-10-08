import { createApi } from './client';
import { transport } from '../lib/runtime';
export const api = createApi(transport);
