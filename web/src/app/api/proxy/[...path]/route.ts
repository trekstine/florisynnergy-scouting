import { NextResponse } from "next/server";

import { getToken } from "@/lib/auth";
import { API_URL } from "@/lib/server-api";

/** Authenticated pass-through to the FastAPI backend — keeps the JWT server-side. */
async function handle(
  request: Request,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await ctx.params;
  const token = await getToken();
  if (!token) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  const search = new URL(request.url).search;
  const target = `${API_URL}/${path.join("/")}${search}`;

  const headers = new Headers();
  headers.set("Authorization", `Bearer ${token}`);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  headers.set("Accept", "application/json");

  const method = request.method;
  const body =
    method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

  const upstream = await fetch(target, { method, headers, body, cache: "no-store" });
  const respBody = await upstream.arrayBuffer();
  return new NextResponse(respBody, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
  });
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
