export type MailSenderKind = "resend" | "smtp" | "console" | "noop" | "log";

export const NOOP_DISABLED_FLOWS = [
  "magic link",
  "email verification",
  "password reset",
  "invites",
  "sign-in alerts",
] as const;

export interface SendMailInput {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
}

export interface MailSenderDriver {
  send(input: SendMailInput): Promise<void>;
}

export interface Mailer extends MailSenderDriver {
  fromAuth: string;
  fromInvite: string;
}
