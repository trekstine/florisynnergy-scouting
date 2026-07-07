import { NextResponse } from "next/server";
import { z } from "zod";

import { baseCookieOptions, TOKEN_COOKIE, USER_COOKIE } from "@/lib/auth";
import { API_URL } from "@/lib/server-api";

const LoginSchema = z.object({
  device_identifier: z.string().min(1),
  pin: z.string().min(4).max(12),
});

export async function POST(request: Request) {
  const parsed = LoginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ detail: "Invalid request body" }, { status: 422 });
  }

  const res = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = (await res.json().catch(() => null))?.detail ?? "Authentication failed";
    return NextResponse.json({ detail }, { status: res.status });
  }

  const data = (await res.json()) as {
    access_token: string;
    employee_id: number;
    name: string;
    role: "scout" | "supervisor" | "admin";
  };

  // The portal is for managers — scouts use the mobile app.
  if (data.role === "scout") {
    return NextResponse.json(
      { detail: "Scouts use the mobile app, not the admin portal." },
      { status: 403 },
    );
  }

  const response = NextResponse.json({
    employee_id: data.employee_id,
    name: data.name,
    role: data.role,
  });
  response.cookies.set(TOKEN_COOKIE, data.access_token, baseCookieOptions);
  response.cookies.set(
    USER_COOKIE,
    JSON.stringify({ employee_id: data.employee_id, name: data.name, role: data.role }),
    { ...baseCookieOptions, httpOnly: false },
  );
  return response;
}
