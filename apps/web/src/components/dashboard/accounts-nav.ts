import { MailPlus, UserCog } from "lucide-react";
import type { Route } from "next";

export const ACCOUNTS_ROOT = "/dashboard/accounts";
export const ACCOUNTS_USERS_HREF: Route = `${ACCOUNTS_ROOT}/users`;
export const ACCOUNTS_INVITES_HREF: Route = `${ACCOUNTS_ROOT}/invites`;

export const ACCOUNTS_USERS_NAV = {
  href: ACCOUNTS_USERS_HREF,
  label: "Users",
  description: "Every account, its instance role and whether it is banned.",
  icon: UserCog,
};

export const ACCOUNTS_INVITES_NAV = {
  href: ACCOUNTS_INVITES_HREF,
  label: "Invites",
  description: "Account invites waiting to be accepted, and sending new ones.",
  icon: MailPlus,
};

export const ACCOUNTS_NAV = [ACCOUNTS_USERS_NAV, ACCOUNTS_INVITES_NAV];
