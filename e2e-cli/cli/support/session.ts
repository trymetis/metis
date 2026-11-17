import { harness } from "@metis/e2e/clients/harness";
import { type Rpc, rpcWithCookie } from "@metis/e2e/clients/rpc";
import { signIn } from "@metis/e2e/clients/sign-in";

let session: Promise<string> | undefined;

export function anaCookie(): Promise<string> {
  session ??= (async () => {
    const account = await harness.account();
    return signIn(account.email, account.password, () => harness.totp());
  })();
  return session;
}

export async function anaRpc(): Promise<Rpc> {
  return rpcWithCookie(await anaCookie());
}

export async function ana(): Promise<{ rpc: Rpc }> {
  return { rpc: await anaRpc() };
}

export function forgetSession(): void {
  session = undefined;
}
