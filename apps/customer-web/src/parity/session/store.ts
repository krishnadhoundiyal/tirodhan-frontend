// Browser command recovery port. No refresh credentials or native APIs.
export interface SecureCredential {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  remove(): Promise<void>;
}
