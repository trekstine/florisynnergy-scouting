import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { TOKEN_COOKIE } from "@/lib/auth";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasToken = Boolean(request.cookies.get(TOKEN_COOKIE)?.value);

  if (pathname === "/login") {
    return hasToken
      ? NextResponse.redirect(new URL("/dashboard", request.url))
      : NextResponse.next();
  }
  if (!hasToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  // Page routes only — API routes return JSON status codes (proxy self-guards).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
