import { cookies } from "next/headers";

import type { SessionUser } from "./types";

export const TOKEN_COOKIE = "flori_token";
export const USER_COOKIE = "flori_user";

const isProd = process.env.NODE_ENV === "production";

export const baseCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 12,
};

export async function getToken(): Promise<string | undefined> {
  return (await cookies()).get(TOKEN_COOKIE)?.value;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const raw = (await cookies()).get(USER_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}
