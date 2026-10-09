import type { Address, ServiceabilityContext } from '../../api/contracts';
export function serviceabilityState(
  context: ServiceabilityContext | undefined,
  address: Address | null,
  now: number,
) {
  if (
    !context ||
    !address ||
    context.source_address_id !== address.address_id ||
    context.source_address_version !== address.version
  )
    return 'missing' as const;
  if (
    !Number.isFinite(Date.parse(context.expires_at)) ||
    Date.parse(context.expires_at) <= now
  )
    return 'expired' as const;
  if (context.status === 'SERVICEABLE') return 'serviceable' as const;
  if (context.status === 'PENDING') return 'pending' as const;
  if (context.status === 'UNSERVICEABLE') return 'unserviceable' as const;
  return 'technicalFailure' as const;
}
