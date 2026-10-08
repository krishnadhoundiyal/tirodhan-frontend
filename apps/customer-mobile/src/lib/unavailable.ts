export class ContractUnavailable extends Error {
  constructor(public readonly capability: string) {
    super(`${capability} is not available yet`);
  }
}
