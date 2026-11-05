import "server-only";
import { createTransport } from "nodemailer";

import type { SmtpMailerConfig } from "@/config/schema";

import type { MailSenderDriver } from "../types";

export function createSmtpTransport(cfg: SmtpMailerConfig) {
  const requireTLS = cfg.plain !== true;
  if (cfg.url) {
    return createTransport({ url: cfg.url, requireTLS });
  }
  const host = cfg.host;
  const port = cfg.port ?? 587;
  const secure = cfg.secure ?? port === 465;
  return createTransport({
    host,
    port,
    secure,
    requireTLS: !secure && requireTLS,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass ?? "" } : undefined,
  });
}

export function createSmtpDriver(cfg: SmtpMailerConfig): MailSenderDriver {
  const transporter = createSmtpTransport(cfg);

  return {
    async send(input) {
      await transporter.sendMail({
        from: input.from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });
    },
  };
}
