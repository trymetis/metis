import "server-only";
import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, gt } from "drizzle-orm";

import { deleteAccount, sharedWorkspacesBlockMessage } from "@/account/delete";
import { buildDataExport } from "@/account/export";
import { appActor, recordAuditEvent } from "@/audit";
import { isOwnerEmail } from "@/auth/owner";
import { getAuth, verify2FA } from "@/auth/server";
import { db } from "@/db";
import { mailRemoteAllow, session, userPrefs } from "@/db/schema";
import { rateLimit } from "@/services/rate-limit";
import { getWorkspaceBySlug, planAccountDelete, setDefaultWorkspaceSlug } from "@/workspace";

import { appSession } from "../middlewares/app-session";
import {
  dataExportSchema,
  deleteAccountEmailSchema,
  deleteAccountInputSchema,
  listRemoteAllowOutputSchema,
  listUserSessionsOutputSchema,
  okSchema,
  preferencesSchema,
  remoteAllowEntrySchema,
  remoteAllowInputSchema,
  revokeRemoteAllowInputSchema,
  revokeUserSessionInputSchema,
  successSchema,
  type UserPreferences,
  updatePreferencesInputSchema,
  workspaceScopeSchema,
} from "../schema";

const DEFAULT_PREFS: UserPreferences = {
  workspaceOrder: [],
  mailRemoteContent: "block",
  mailCleanLinks: true,
  signInAlerts: true,
};

const PREF_COLUMNS = {
  workspaceOrder: userPrefs.workspaceOrder,
  mailRemoteContent: userPrefs.mailRemoteContent,
  mailCleanLinks: userPrefs.mailCleanLinks,
  signInAlerts: userPrefs.signInAlerts,
};

async function storedPreferences(userId: string): Promise<UserPreferences> {
  const [row] = await db
    .select(PREF_COLUMNS)
    .from(userPrefs)
    .where(eq(userPrefs.userId, userId))
    .limit(1);
  return row ?? DEFAULT_PREFS;
}

async function limitPreferenceWrites(userId: string) {
  const rl = await rateLimit(userId, {
    scope: "user-preferences",
    limit: 30,
    windowSec: 60,
  });
  if (!rl.ok) {
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message: "Too many requests. Please slow down.",
      data: { retryAfterSec: Math.ceil(rl.resetMs / 1000) },
    });
  }
}

async function assertCanDeleteAccount(
  appUser: {
    userId: string;
    twoFactorEnabled: boolean;
    user: { email: string };
  },
  email: string,
) {
  if (!appUser.twoFactorEnabled) {
    throw new ORPCError("FORBIDDEN", {
      message: "Turn on two-factor authentication first.",
    });
  }

  const rl = await rateLimit(appUser.userId, {
    scope: "delete-account",
    limit: 5,
    windowSec: 300,
  });
  if (!rl.ok) {
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message: "Too many attempts. Please slow down.",
      data: { retryAfterSec: Math.ceil(rl.resetMs / 1000) },
    });
  }

  if (email.toLowerCase() !== appUser.user.email.toLowerCase()) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Type your account email to confirm.",
    });
  }

  if (isOwnerEmail(appUser.user.email)) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "You're this instance's owner. Point METIS_OWNER_EMAIL at another account first, then come back.",
    });
  }

  const plan = await planAccountDelete(appUser.userId);
  if (plan.blocking.length > 0) {
    throw new ORPCError("BAD_REQUEST", {
      message: sharedWorkspacesBlockMessage(plan.blocking.length, "you"),
    });
  }

  return plan;
}

export const userRouter = {
  setDefaultWorkspace: appSession
    .input(workspaceScopeSchema)
    .output(okSchema)
    .handler(async ({ input, context }) => {
      const membership = await getWorkspaceBySlug(context.appUser.userId, input.workspaceSlug);
      if (!membership) {
        throw new ORPCError("FORBIDDEN", { message: "Unknown workspace" });
      }
      await setDefaultWorkspaceSlug(context.appUser.userId, membership.slug);
      return { ok: true as const };
    }),

  getPreferences: appSession
    .output(preferencesSchema)
    .handler(async ({ context }) => storedPreferences(context.appUser.userId)),

  updatePreferences: appSession
    .input(updatePreferencesInputSchema)
    .output(preferencesSchema)
    .handler(async ({ input, context }) => {
      await limitPreferenceWrites(context.appUser.userId);

      const alertsWereOn =
        input.signInAlerts === false &&
        (await storedPreferences(context.appUser.userId)).signInAlerts;
      const now = new Date();
      const changes = {
        ...(input.workspaceOrder !== undefined && {
          workspaceOrder: input.workspaceOrder,
        }),
        ...(input.mailRemoteContent !== undefined && {
          mailRemoteContent: input.mailRemoteContent,
        }),
        ...(input.mailCleanLinks !== undefined && {
          mailCleanLinks: input.mailCleanLinks,
        }),
        ...(input.signInAlerts !== undefined && {
          signInAlerts: input.signInAlerts,
        }),
      };
      const [row] = await db
        .insert(userPrefs)
        .values({
          userId: context.appUser.userId,
          ...DEFAULT_PREFS,
          ...changes,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: userPrefs.userId,
          set: { ...changes, updatedAt: now },
        })
        .returning(PREF_COLUMNS);

      if (alertsWereOn) {
        await recordAuditEvent(appActor(context.appUser, context.headers), {
          action: "sign_in_alerts.disabled",
        });
      }

      return row ?? DEFAULT_PREFS;
    }),

  listRemoteAllow: appSession.output(listRemoteAllowOutputSchema).handler(async ({ context }) => {
    const entries = await db
      .select({
        id: mailRemoteAllow.id,
        kind: mailRemoteAllow.kind,
        value: mailRemoteAllow.value,
        createdAt: mailRemoteAllow.createdAt,
      })
      .from(mailRemoteAllow)
      .where(eq(mailRemoteAllow.userId, context.appUser.userId))
      .orderBy(asc(mailRemoteAllow.kind), asc(mailRemoteAllow.value));
    return { entries };
  }),

  allowRemote: appSession
    .input(remoteAllowInputSchema)
    .output(remoteAllowEntrySchema)
    .handler(async ({ input, context }) => {
      await limitPreferenceWrites(context.appUser.userId);
      const [row] = await db
        .insert(mailRemoteAllow)
        .values({
          id: crypto.randomUUID(),
          userId: context.appUser.userId,
          kind: input.kind,
          value: input.value,
          createdAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [mailRemoteAllow.userId, mailRemoteAllow.kind, mailRemoteAllow.value],
          set: { value: input.value },
        })
        .returning({
          id: mailRemoteAllow.id,
          kind: mailRemoteAllow.kind,
          value: mailRemoteAllow.value,
          createdAt: mailRemoteAllow.createdAt,
        });
      if (!row) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Could not save that sender",
        });
      }
      return row;
    }),

  revokeRemote: appSession
    .input(revokeRemoteAllowInputSchema)
    .output(okSchema)
    .handler(async ({ input, context }) => {
      await db
        .delete(mailRemoteAllow)
        .where(
          and(eq(mailRemoteAllow.id, input.id), eq(mailRemoteAllow.userId, context.appUser.userId)),
        );
      return { ok: true as const };
    }),

  listSessions: appSession.output(listUserSessionsOutputSchema).handler(async ({ context }) => {
    const current = await getAuth().api.getSession({
      headers: context.headers,
    });

    const rows = await db
      .select({
        id: session.id,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        updatedAt: session.updatedAt,
        expiresAt: session.expiresAt,
      })
      .from(session)
      .where(and(eq(session.userId, context.appUser.userId), gt(session.expiresAt, new Date())))
      .orderBy(desc(session.updatedAt));

    return rows.map((row) => ({
      ...row,
      isCurrent: row.id === current?.session.id,
    }));
  }),

  revokeSession: appSession
    .input(revokeUserSessionInputSchema)
    .output(okSchema)
    .handler(async ({ input, context }) => {
      const [row] = await db
        .select({ token: session.token })
        .from(session)
        .where(and(eq(session.id, input.sessionId), eq(session.userId, context.appUser.userId)))
        .limit(1);

      if (!row) {
        throw new ORPCError("NOT_FOUND", { message: "Unknown session" });
      }

      await getAuth().api.revokeSession({
        body: { token: row.token },
        headers: context.headers,
      });

      return { ok: true as const };
    }),

  exportData: appSession.output(dataExportSchema).handler(async ({ context }) => {
    const rl = await rateLimit(context.appUser.userId, {
      scope: "data-export",
      limit: 5,
      windowSec: 600,
    });
    if (!rl.ok) {
      throw new ORPCError("TOO_MANY_REQUESTS", {
        message: "Too many exports. Try again in a few minutes.",
        data: { retryAfterSec: Math.ceil(rl.resetMs / 1000) },
      });
    }
    return buildDataExport(context.appUser.userId);
  }),

  prepareDeleteAccount: appSession
    .input(deleteAccountEmailSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      await assertCanDeleteAccount(context.appUser, input.email);
      return { success: true as const };
    }),

  deleteAccount: appSession
    .input(deleteAccountInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const { appUser } = context;
      const plan = await assertCanDeleteAccount(appUser, input.email);

      const verified = await verify2FA({
        code: input.code,
        headers: context.headers,
      });
      if (!verified) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "Invalid authenticator or backup code",
        });
      }

      const deleted = await deleteAccount(appUser.userId, plan);
      await recordAuditEvent(appActor(appUser, context.headers), {
        action: "account.deleted",
        detail: deleted,
      });

      return { success: true as const };
    }),
};
