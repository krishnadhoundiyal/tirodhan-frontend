import type { SessionSnapshot } from './store';
export function riderAdmission(state: SessionSnapshot, preview = false) {
  if (preview) return 'admitted' as const;
  if (state.status === 'signedOut') return 'login' as const;
  if (state.status === 'starting' || state.principalState === 'loading')
    return 'loading' as const;
  if (!state.principal || state.principalState !== 'available')
    return 'retry' as const;
  return state.principal.roles.includes('RIDER')
    ? ('admitted' as const)
    : ('forbidden' as const);
}
