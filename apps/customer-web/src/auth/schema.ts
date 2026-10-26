export class ContractError extends Error {
  constructor() {
    super('The service response could not be verified.');
  }
}
export type Decoder<T> = (value: unknown) => T;
export type Decoded<D> = D extends Decoder<infer T> ? T : never;
export const text: Decoder<string> = (value) => {
  if (typeof value !== 'string' || !value.length || value.length > 500)
    throw new ContractError();
  return value;
};
export const uuid: Decoder<string> = (value) => {
  const result = text(value);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      result,
    )
  )
    throw new ContractError();
  return result;
};
export const integer: Decoder<number> = (value) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new ContractError();
  return value;
};
export const bool: Decoder<boolean> = (value) => {
  if (typeof value !== 'boolean') throw new ContractError();
  return value;
};
export const timestamp: Decoder<string> = (value) => {
  const result = text(value);
  if (
    !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(result) ||
    !Number.isFinite(Date.parse(result))
  )
    throw new ContractError();
  return result;
};
export const nullable =
  <T>(parse: Decoder<T>): Decoder<T | null> =>
  (value) =>
    value === null ? null : parse(value);
export const list =
  <T>(parse: Decoder<T>, max = 10000): Decoder<T[]> =>
  (value) => {
    if (!Array.isArray(value) || value.length > max) throw new ContractError();
    return value.map(parse);
  };
type Schema = Record<string, Decoder<unknown>>;
export const object =
  <S extends Schema>(schema: S): Decoder<{ [K in keyof S]: Decoded<S[K]> }> =>
  (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new ContractError();
    const row = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(schema).map(([key, parse]) => [key, parse(row[key])]),
    ) as { [K in keyof S]: Decoded<S[K]> };
  };
