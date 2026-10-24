import type { createAuthApi } from '../api/client';
import type { SessionStore } from '../session/store';
import { ApiError } from '../api/errors';

// Existing OTP protocol and prepared-command pattern, owned exclusively by this app.
export function authFlow(
  api: ReturnType<typeof createAuthApi>,
  session: SessionStore,
  uuid: () => string,
) {
  let challenge: string | null = null;
  let startIntent: { phone: string; client_request_id: string } | null = null;
  let verifyIntent: {
    challenge_reference: string;
    code: string;
    client_login_id: string;
  } | null = null;
  let startFlight: Promise<void> | null = null,
    verifyFlight: Promise<void> | null = null;
  let generation = 0;
  return {
    hasChallenge: () => challenge !== null,
    clear() {
      generation++;
      challenge = null;
      startIntent = null;
      verifyIntent = null;
      startFlight = null;
      verifyFlight = null;
    },
    start(phone: string): Promise<void> {
      if (startFlight) return startFlight;
      const current = generation;
      if (startIntent?.phone !== phone)
        startIntent = { phone, client_request_id: uuid() };
      const operation = api.startOtp(startIntent).then((result) => {
        if (current === generation) {
          challenge = result.challenge_reference;
          startIntent = null;
          verifyIntent = null;
        }
      });
      startFlight = operation;
      void operation.then(
        () => {
          if (startFlight === operation) startFlight = null;
        },
        () => {
          if (startFlight === operation) startFlight = null;
        },
      );
      return operation;
    },
    verify(code: string): Promise<void> {
      if (verifyFlight) return verifyFlight;
      if (!challenge) return Promise.reject(new ApiError(422));
      const current = generation;
      if (
        verifyIntent?.code !== code ||
        verifyIntent.challenge_reference !== challenge
      )
        verifyIntent = {
          challenge_reference: challenge,
          code,
          client_login_id: uuid(),
        };
      const operation = api.verifyOtp(verifyIntent).then(async (result) => {
        if (current === generation) {
          await session.establish(result);
          if (current === generation) {
            challenge = null;
            verifyIntent = null;
          }
        }
      });
      verifyFlight = operation;
      void operation.then(
        () => {
          if (verifyFlight === operation) verifyFlight = null;
        },
        () => {
          if (verifyFlight === operation) verifyFlight = null;
        },
      );
      return operation;
    },
  };
}
