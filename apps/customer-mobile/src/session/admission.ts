import type { SessionSnapshot } from './store';
export function productAdmission(state: SessionSnapshot, preview: boolean) {
  if (preview) return 'admitted' as const;
  if (state.status === 'signedOut') return 'login' as const;
  if (state.status === 'starting' || state.principalState === 'loading')
    return 'loading' as const;
  if (!state.principal || state.principalState !== 'available')
    return 'retry' as const;
  return state.principal.roles.includes('CUSTOMER')
    ? ('admitted' as const)
    : ('forbidden' as const);
}
