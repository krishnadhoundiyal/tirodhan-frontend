import type { SessionSnapshot } from '../session/store';

// A query/draft namespace only. Never a customer ID, principal or JWT.
export const previewOwner = 'screen-preview:synthetic-navigation-only';
export function createPreviewNavigation() {
  let snapshot: SessionSnapshot = Object.freeze({
    status: 'signedOut',
    userId: null,
    principal: null,
    principalState: 'idle',
    principalError: null,
    ownerVersion: 0,
  });
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    bootstrap: async () => {},
    renewIfExpired: async () => {},
    loadPrincipal: async () => {},
    reset: () => {
      snapshot = Object.freeze({
        ...snapshot,
        ownerVersion: snapshot.ownerVersion + 1,
      });
      listeners.forEach((listener) => listener());
    },
  };
}
export const previewNavigation = createPreviewNavigation();
