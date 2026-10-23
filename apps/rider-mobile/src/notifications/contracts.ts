export type PushPlatform = 'ANDROID' | 'IOS';
export type Permission = 'granted' | 'denied' | 'undetermined';
export interface NativePush {
  platform: PushPlatform;
  permission(request: boolean): Promise<Permission>;
  token(): Promise<string>;
  reset(): Promise<void>;
  tokenChanged(callback: () => void): () => void;
  received(callback: (data: unknown) => void): () => void;
  opened(callback: (data: unknown) => void): () => void;
  initial(): Promise<unknown>;
  background(callback: (data: unknown) => Promise<void>): void;
}
export interface PushApi {
  register(id: string, platform: PushPlatform, token: string): Promise<void>;
  revoke(id: string): Promise<void>;
}
export type Installation = {
  version: 1;
  id: string;
  owner: string | null;
  reset: boolean;
};
export interface InstallationStore {
  load(): Promise<Installation>;
  save(record: Installation): Promise<void>;
}
