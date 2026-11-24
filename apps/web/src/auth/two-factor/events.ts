export type TwoFactorEventAction =
  | "authenticator.added"
  | "authenticator.removed"
  | "passkey.added"
  | "passkey.removed"
  | "two_factor.disabled";

export interface TwoFactorEvent {
  action: TwoFactorEventAction;
  user: { id: string; email: string };
  label: string | null;
  headers: Headers | undefined;
}
