import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

import { instanceRoleOf } from "@/auth/instance-role";
import { NATIVE_TICKET_PARAM } from "@/auth/native";
import { getAuth } from "@/auth/server";
import {
  sanitizeCallbackPath,
  TWO_FACTOR_CALLBACK_COOKIE,
  TWO_FACTOR_CALLBACK_MAX_AGE,
} from "@/auth/two-factor-callback";
import { maintenanceResponse } from "@/maintenance/response";

const NOT_FOUND_ROUTE = "/_not-found";
const TWO_FACTOR_SETUP_PATH = "/2fa/setup";
const INVITE_ACCEPT_PATH = "/invite/accept";
const CONNECT_START_PREFIX = "/api/connections/start/";
const GUARDED_PATHS = new Set(["/w", "/settings", "/dashboard", INVITE_ACCEPT_PATH]);
const GUARDED_PREFIXES = ["/w/", "/settings/", "/dashboard/"];
const UNGUARDED_API =
  /^\/api\/(?:auth\/|mcp|workflows\/tick|inbound\/|drive\/relay\/|livez|readyz)/;

function protectedPath(pathname: string): boolean {
  if (GUARDED_PATHS.has(pathname)) return true;
  if (GUARDED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  return pathname.startsWith("/api/") && !UNGUARDED_API.test(pathname);
}

function notFound(request: NextRequest) {
  return NextResponse.rewrite(new URL(NOT_FOUND_ROUTE, request.url));
}

function isApiCall(pathname: string): boolean {
  return pathname.startsWith("/api/") && !pathname.startsWith(CONNECT_START_PREFIX);
}

function isConnectCallback(pathname: string): boolean {
  return pathname.startsWith("/api/connections/") && pathname.endsWith("/callback");
}

function signInRequired(request: NextRequest) {
  if (isApiCall(request.nextUrl.pathname)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/", request.url));
}

function twoFactorRequired(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isApiCall(pathname)) {
    return NextResponse.json({ error: "Set up two-factor authentication first." }, { status: 403 });
  }
  const response = NextResponse.redirect(new URL(TWO_FACTOR_SETUP_PATH, request.url));
  const callback = sanitizeCallbackPath(`${pathname}${search}`);
  if (callback && !pathname.startsWith("/api/")) {
    response.cookies.set(TWO_FACTOR_CALLBACK_COOKIE, callback, {
      path: "/",
      maxAge: TWO_FACTOR_CALLBACK_MAX_AGE,
      sameSite: "lax",
    });
  }
  return response;
}

async function readSession(request: NextRequest) {
  if (!getSessionCookie(request)) return null;
  return getAuth().api.getSession({ headers: request.headers });
}

async function guardDashboard(request: NextRequest) {
  const session = await readSession(request);
  if (!session || !(await instanceRoleOf(session.user))) return notFound(request);
  if (!session.user.twoFactorEnabled) return twoFactorRequired(request);

  return NextResponse.next();
}

export async function proxy(request: NextRequest) {
  const closed = maintenanceResponse(
    (request.headers.get("accept") ?? "").includes("text/html"),
    request.url,
  );
  if (closed) return closed;

  const { pathname, searchParams } = request.nextUrl;
  if (!protectedPath(pathname)) return NextResponse.next();

  if (pathname.startsWith("/dashboard")) {
    return guardDashboard(request);
  }

  if (isConnectCallback(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith(CONNECT_START_PREFIX) && searchParams.has(NATIVE_TICKET_PARAM)) {
    return NextResponse.next();
  }

  const session = await readSession(request);

  if (!session) {
    if (pathname === INVITE_ACCEPT_PATH) return NextResponse.next();
    return signInRequired(request);
  }

  if (!session.user.twoFactorEnabled) {
    return twoFactorRequired(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static/|_next/image|favicon.ico|icon.svg|apple-icon.png|api/livez|api/readyz|api/drive/relay/|rpc/).*)",
  ],
};
