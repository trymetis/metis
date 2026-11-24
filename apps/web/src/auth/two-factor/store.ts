import type { GenericEndpointContext, User } from "better-auth";

import { authenticatorName } from "./authenticators";
import {
  DEFAULT_TWO_FACTOR_METHOD,
  isTwoFactorMethod,
  type PublicPasskey,
  type TwoFactorMethod,
  type TwoFactorMethodList,
} from "./methods";

export const TWO_FACTOR_MODEL = "twoFactor";
export const TOTP_MODEL = "totp";
export const PASSKEY_MODEL = "passkey";

export interface TwoFactorRow {
  id: string;
  userId: string;
  backupCodes: string;
  preferredMethod?: string | null;
  failedVerificationCount?: number | null;
  lockedUntil?: Date | null;
}

export interface TotpRow {
  id: string;
  userId: string;
  secret: string;
  verified: boolean;
}

export interface PasskeyRow {
  id: string;
  name?: string | null;
  publicKey: string;
  userId: string;
  credentialID: string;
  counter: number;
  deviceType: string;
  backedUp: boolean;
  transports?: string | null;
  createdAt?: Date | null;
  aaguid?: string | null;
}

export type TwoFactorUser = User & { twoFactorEnabled?: boolean | null };

export interface Factors {
  state: TwoFactorRow | null;
  totp: TotpRow | null;
  passkeys: PasskeyRow[];
}

export function twoFactorEnabled(user: object): boolean {
  return "twoFactorEnabled" in user && user.twoFactorEnabled === true;
}

export async function loadFactors(ctx: GenericEndpointContext, userId: string): Promise<Factors> {
  const where = [{ field: "userId", value: userId }];
  const [state, totp, passkeys] = await Promise.all([
    ctx.context.adapter.findOne<TwoFactorRow>({ model: TWO_FACTOR_MODEL, where }),
    ctx.context.adapter.findOne<TotpRow>({ model: TOTP_MODEL, where }),
    ctx.context.adapter.findMany<PasskeyRow>({ model: PASSKEY_MODEL, where }),
  ]);
  return { state, totp, passkeys };
}

export function activeMethods(factors: Factors): TwoFactorMethod[] {
  const methods: TwoFactorMethod[] = [];
  if (factors.totp?.verified) methods.push("totp");
  if (factors.passkeys.length > 0) methods.push("passkey");
  return methods;
}

export function publicPasskey(row: PasskeyRow): PublicPasskey {
  return {
    id: row.id,
    name: row.name || authenticatorName(row.aaguid) || "Passkey",
    createdAt: row.createdAt ?? null,
    backedUp: row.backedUp,
  };
}

export function methodList(factors: Factors, { withPasskeys }: { withPasskeys: boolean }) {
  const methods = activeMethods(factors);
  const stored = factors.state?.preferredMethod;
  const preferred =
    isTwoFactorMethod(stored) && methods.includes(stored)
      ? stored
      : (methods[0] ?? DEFAULT_TWO_FACTOR_METHOD);
  const list: TwoFactorMethodList = {
    methods: [preferred, ...methods.filter((method) => method !== preferred)].filter((method) =>
      methods.includes(method),
    ),
    preferred,
    passkeys: withPasskeys
      ? factors.passkeys
          .toSorted((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0))
          .map(publicPasskey)
      : [],
  };
  return list;
}

export async function setTwoFactorEnabled(
  ctx: GenericEndpointContext,
  userId: string,
  enabled: boolean,
): Promise<TwoFactorUser> {
  return ctx.context.internalAdapter.updateUser(userId, { twoFactorEnabled: enabled });
}
