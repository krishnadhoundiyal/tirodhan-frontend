import { session, previewCatalogue } from './runtime';
import { previewNavigation, previewOwner } from '../preview/navigation';
import type { SessionSnapshot } from '../session/store';

export const navigationSession = previewCatalogue ? previewNavigation : session;
export const navigationOwner = (state: SessionSnapshot) =>
  previewCatalogue ? previewOwner : (state.userId ?? 'signed-out');
