export const TWO_FACTOR_METHODS = ["totp", "passkey"] as const;
export type TwoFactorMethod = (typeof TWO_FACTOR_METHODS)[number];

export const VERIFY_METHODS = ["totp", "passkey", "backup_code"] as const;
export type VerifyMethod = (typeof VERIFY_METHODS)[number];

export const DEFAULT_TWO_FACTOR_METHOD: TwoFactorMethod = "totp";

export interface PublicPasskey {
  id: string;
  name: string;
  createdAt: Date | string | null;
  backedUp: boolean;
}

export interface TwoFactorMethodList {
  methods: TwoFactorMethod[];
  preferred: TwoFactorMethod;
  passkeys: PublicPasskey[];
}

export function isTwoFactorMethod(value: unknown): value is TwoFactorMethod {
  return TWO_FACTOR_METHODS.some((method) => method === value);
}
