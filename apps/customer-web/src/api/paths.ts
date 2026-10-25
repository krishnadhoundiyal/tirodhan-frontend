export function customerPathAllowed(path: string, method: string) {
  let u: URL;
  try {
    u = new URL(path, 'https://scope.invalid');
  } catch {
    return false;
  }
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    u.origin !== 'https://scope.invalid' ||
    u.hash ||
    /[\r\n\\]/.test(path)
  )
    return false;
  const id = '[a-fA-F0-9-]{36}';
  const exact = (pattern: string) =>
    new RegExp(`^${pattern}$`).test(u.pathname);
  if (
    [...u.searchParams.keys()].some(
      (k) =>
        !['view', 'limit', 'cursor', 'serviceability_context_id'].includes(k),
    )
  )
    return false;
  if (u.search) {
    if (method !== 'GET') return false;
    if (exact('/v2/customer/slot-availability'))
      return (
        [...u.searchParams].length === 1 &&
        /^[a-fA-F0-9-]{36}$/.test(
          u.searchParams.get('serviceability_context_id') ?? '',
        )
      );
    if (
      ![
        '/v1/customer/collection-requests',
        '/v1/customer/notifications',
      ].includes(u.pathname)
    )
      return false;
    if (
      u.searchParams.get('limit') !== '20' ||
      (u.pathname.endsWith('/collection-requests') &&
        !['active', 'history'].includes(u.searchParams.get('view') ?? ''))
    )
      return false;
    const allowed = u.pathname.endsWith('/notifications')
      ? ['limit', 'cursor']
      : ['view', 'limit', 'cursor'];
    if (
      [...u.searchParams.keys()].some((k) => !allowed.includes(k)) ||
      [...new Set(u.searchParams.keys())].some(
        (k) => u.searchParams.getAll(k).length !== 1,
      )
    )
      return false;
    const cursor = u.searchParams.get('cursor');
    if (cursor && (cursor.length > 2000 || !/^[A-Za-z0-9_.=-]+$/.test(cursor)))
      return false;
  }
  if (method === 'GET')
    return (
      exact(`/v1/addresses`) ||
      exact(`/v1/serviceability/contexts/${id}`) ||
      exact(
        `/v1/customer/(collection-catalogue|weight-pricing-policy|recommendations/collection-categories|collection-requests(?:/${id}(?:/(payment|refunds))?)?|notifications|payment-methods|me/(profile|preferences|favourite-categories)|payment-attempts/${id}/checkout)`,
      ) ||
      exact(`/v2/customer/(slot-availability|slot-holds/${id})`) ||
      exact('/v1/content/(about|help|terms|privacy)')
    );
  if (u.search) return false;
  if (method === 'POST')
    return (
      exact(
        `/v1/(addresses(?:/${id}/archive)?|serviceability/contexts|collection-requests(?:/${id}/cancel)?|payments/collection-requests/${id}/attempts|customer/(collection-quotes|feedback))`,
      ) || exact('/v2/customer/slot-holds')
    );
  return (
    method === 'PUT' &&
    (exact(`/v1/addresses/${id}`) ||
      exact('/v1/customer/me/(profile|preferences|favourite-categories)'))
  );
}
