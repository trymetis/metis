import { z } from "zod";

const zohoValueSchema = z.union([z.string(), z.number()]);

const zohoMailAccountSchema = z.object({
  accountId: zohoValueSchema.optional(),
  zuid: zohoValueSchema.optional(),
  type: z.string().optional(),
  primaryEmailAddress: z.string().optional(),
  mailboxAddress: z.string().optional(),
  emailAddress: z
    .array(z.object({ mailId: z.string().optional(), isPrimary: z.boolean().optional() }))
    .optional()
    .catch(undefined),
  displayName: z.string().optional(),
  firstName: z.string().optional(),
});

export type ZohoMailAccount = z.infer<typeof zohoMailAccountSchema>;

export function parseZohoAccounts(body: unknown): ZohoMailAccount[] {
  const parsed = z.object({ data: z.array(z.unknown()) }).safeParse(body);
  if (!parsed.success) return [];
  return parsed.data.data.flatMap((item) => {
    const account = zohoMailAccountSchema.safeParse(item);
    return account.success ? [account.data] : [];
  });
}

export function zohoAccountAddress(account: ZohoMailAccount): string {
  return (
    account.primaryEmailAddress ??
    account.mailboxAddress ??
    account.emailAddress?.find((entry) => entry.isPrimary)?.mailId ??
    ""
  );
}

function addressesOf(account: ZohoMailAccount): string[] {
  return [
    account.primaryEmailAddress,
    account.mailboxAddress,
    ...(account.emailAddress ?? []).map((entry) => entry.mailId),
  ].flatMap((address) => (address ? [address.trim().toLowerCase()] : []));
}

export function pickZohoAccount(
  accounts: ZohoMailAccount[],
  email: string,
): ZohoMailAccount | undefined {
  const wanted = email.trim().toLowerCase();
  return (
    (wanted ? accounts.find((account) => addressesOf(account).includes(wanted)) : undefined) ??
    accounts.find((account) => account.type === "ZOHO_ACCOUNT") ??
    accounts[0]
  );
}
