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

const NOT_FOUND_ROUTE = "/_not-found";
const TWO_FACTOR_SETUP_PATH = "/2fa/setup";
const INVITE_ACCEPT_PATH = "/invite/accept";
const CONNECT_START_PREFIX = "/api/connections/start/";

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
  const { pathname, searchParams } = request.nextUrl;

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
    "/w/:path*",
    "/settings/:path*",
    "/dashboard",
    "/dashboard/:path*",
    "/invite/accept",
    "/api/((?!auth/|mcp|workflows/tick|inbound/|drive/relay/|livez|readyz).*)",
  ],
};
