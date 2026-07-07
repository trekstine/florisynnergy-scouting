import { NextResponse } from "next/server";

import { TOKEN_COOKIE, USER_COOKIE } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(TOKEN_COOKIE);
  response.cookies.delete(USER_COOKIE);
  return response;
}
