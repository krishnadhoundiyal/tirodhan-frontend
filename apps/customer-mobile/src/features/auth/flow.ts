import type { createApi } from '../../api/client';
import type { SessionStore } from '../../session/store';
export function authFlow(
  api: ReturnType<typeof createApi>,
  session: SessionStore,
  uuid: () => string,
) {
  return {
    start: (phone: string) =>
      api.startOtp({ client_request_id: uuid(), phone }),
    async verify(challenge_reference: string, code: string) {
      const result = await api.verifyOtp({
        client_login_id: uuid(),
        challenge_reference,
        code,
      });
      await session.establish(result);
    },
  };
}
