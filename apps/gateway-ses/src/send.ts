import { SendEmailCommand, SESv2Client, SESv2ServiceException } from "@aws-sdk/client-sesv2";
import { GatewaySendError, type OutgoingMail } from "@metis/gateway-contract/router";
import MailComposer from "nodemailer/lib/mail-composer";

import { env } from "./env";

const ses = new SESv2Client({ region: env.region });

function messageIdHost(region: string): string {
  return region === "us-east-1" ? "email.amazonses.com" : `${region}.amazonses.com`;
}

function buildRaw(mail: OutgoingMail): Promise<Buffer> {
  const composer = new MailComposer({
    from: mail.from,
    to: mail.to,
    ...(mail.cc ? { cc: mail.cc } : {}),
    ...(mail.bcc ? { bcc: mail.bcc } : {}),
    subject: mail.subject,
    ...(mail.html ? { html: mail.html } : {}),
    ...(mail.text ? { text: mail.text } : {}),
    ...(mail.headers ? { headers: mail.headers } : {}),
    ...(mail.attachments
      ? {
          attachments: mail.attachments.map((attachment) => ({
            filename: attachment.filename,
            content: Buffer.from(attachment.contentBase64, "base64"),
            contentType: attachment.mimeType,
          })),
        }
      : {}),
  });
  return composer.compile().build();
}

export async function sendMail(mail: OutgoingMail): Promise<{ messageIdHeader: string | null }> {
  const raw = await buildRaw(mail);
  try {
    const sent = await ses.send(
      new SendEmailCommand({
        FromEmailAddress: mail.from,
        Destination: {
          ToAddresses: mail.to,
          ...(mail.cc ? { CcAddresses: mail.cc } : {}),
          ...(mail.bcc ? { BccAddresses: mail.bcc } : {}),
        },
        Content: { Raw: { Data: raw } },
      }),
    );
    return {
      messageIdHeader: sent.MessageId ? `<${sent.MessageId}@${messageIdHost(env.region)}>` : null,
    };
  } catch (err) {
    if (err instanceof SESv2ServiceException) throw new GatewaySendError(err.message);
    throw err;
  }
}
