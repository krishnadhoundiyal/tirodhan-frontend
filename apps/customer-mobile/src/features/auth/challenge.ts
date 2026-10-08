// Ephemeral OTP intent, never router parameters/storage/telemetry.
let challenge: { reference: string; phone: string } | null = null;
export function setChallenge(value: typeof challenge) {
  challenge = value;
}
export function getChallenge() {
  return challenge;
}
