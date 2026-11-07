import { getInstanceConfig } from "@/config/runtime";

import type { OAuthProfile, TokenSet } from "../types";
import { parseZohoAccounts, pickZohoAccount, zohoAccountAddress } from "../zoho-accounts";
import { isZohoRegion, zohoRegionOrder } from "../zoho-regions";
import { createOAuthDriver, postForm } from "./oauth";

interface ZohoUserInfo {
  Email?: string;
  email?: string;
  Display_Name?: string;
  full_name?: string;
  first_name?: string;
  ZUID?: string | number;
  user_id?: string | number;
}

const accountsServer = (dc: string) => `https://accounts.zoho.${dc}`;
const defaultAccountsServer = () => accountsServer(getInstanceConfig().zoho.region);
const ACCOUNTS_HOST_PREFIX = "accounts.zoho.";

function knownAccountsServer(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  if (url.pathname !== "/" || url.search || url.hash) return null;
  if (!url.hostname.startsWith(ACCOUNTS_HOST_PREFIX)) return null;
  const dc = url.hostname.slice(ACCOUNTS_HOST_PREFIX.length);
  return isZohoRegion(dc) ? accountsServer(dc) : null;
}

function requireAccountsServer(raw: string | null | undefined): string {
  if (!raw) return defaultAccountsServer();
  const server = knownAccountsServer(raw);
  if (!server) throw new Error("Zoho named an accounts server this app does not know");
  return server;
}

async function getProfile(token: TokenSet): Promise<OAuthProfile> {
  const server = requireAccountsServer(token.meta?.accountsServer);
  const headers = { Authorization: `Zoho-oauthtoken ${token.accessToken}` };

  let email = "";
  let name = "";
  let id = "";

  const profileRes = await fetch(`${server}/oauth/user/info`, { headers });
  if (profileRes.ok) {
    try {
      const p: ZohoUserInfo = await profileRes.json();
      email = p.Email ?? p.email ?? "";
      name = p.Display_Name ?? p.full_name ?? p.first_name ?? "";
      id = String(p.ZUID ?? p.user_id ?? "");
    } catch {}
  }

  if (!email) {
    const dcDomain = server.replace("https://accounts.zoho.", "");
    const mailRes = await fetch(`https://mail.zoho.${dcDomain}/api/accounts`, {
      headers,
    });
    if (mailRes.ok) {
      try {
        const acc = pickZohoAccount(parseZohoAccounts(await mailRes.json()), "");
        email = acc ? zohoAccountAddress(acc) : "";
        name = name || acc?.displayName || acc?.firstName || "";
        id = id || String(acc?.accountId ?? acc?.zuid ?? "");
      } catch {}
    }
  }

  if (!email) throw new Error("Could not retrieve mailbox email from Zoho");
  return {
    providerAccountId: id || email,
    email,
    name: name || email.split("@")[0],
  };
}

export const zohoDriver = createOAuthDriver({
  provider: "zoho",
  label: "Zoho Mail",
  mergesGrantedScopes: false,
  scopes: {
    base: ["AaaServer.profile.READ"],
    byResource: {
      mailbox: ["ZohoMail.messages.ALL", "ZohoMail.folders.ALL", "ZohoMail.accounts.READ"],
      calendar: ["ZohoCalendar.calendar.ALL", "ZohoCalendar.event.ALL"],
      drive: [],
      addressbook: ["ZohoContacts.contactapi.ALL"],
    },
    markers: {
      mailbox: "zohomail.",
      calendar: "zohocalendar.",
      drive: "zohoworkdrive.",
      addressbook: "zohocontacts.",
    },
    separator: ",",
  },
  authorizeUrl: () => `${defaultAccountsServer()}/oauth/v2/auth`,
  tokenEndpoint: () => `${defaultAccountsServer()}/oauth/v2/token`,
  authorizeParams: () => ({ access_type: "offline", prompt: "consent" }),
  exchangeTarget: ({ query }) => {
    const server = requireAccountsServer(query.get("accounts-server"));
    return {
      endpoint: `${server}/oauth/v2/token`,
      meta: { accountsServer: server },
    };
  },
  refreshEndpoints: () => zohoRegionOrder().map((dc) => `${accountsServer(dc)}/oauth/v2/token`),
  getProfile,
  async revoke({ refreshToken }) {
    if (!refreshToken) return;
    for (const dc of zohoRegionOrder()) {
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop -- tries each Zoho region in order and stops at the one that owns the token
        const res = await postForm(`${accountsServer(dc)}/oauth/v2/token/revoke`, {
          token: refreshToken,
        });
        if (res.ok) return;
      } catch {}
    }
  },
});
