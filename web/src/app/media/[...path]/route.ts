import { NextResponse } from "next/server";

import { API_URL } from "@/lib/server-api";

/**
 * Streams scouting photos from the FastAPI backend's `/media/*` static mount.
 *
 * The API container is never exposed publicly in production (only `web` sits
 * behind Caddy — see docker-compose.prod.yml), so an `image_url` like
 * `/media/<file>.jpg` returned by the scouting API only resolves for clients
 * that can reach the API directly (e.g. the mobile app on the farm LAN). The
 * browser rendering the portal cannot, so we proxy it through the portal's
 * own origin here. Photos aren't sensitive enough to warrant gating this on
 * the session cookie the way `/api/proxy` does for JSON data.
 */
async function handle(
  request: Request,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await ctx.params;
  const target = `${API_URL}/media/${path.join("/")}`;

  const upstream = await fetch(target, { cache: "no-store" });
  if (!upstream.ok) {
    return NextResponse.json(
      { detail: "Image not found" },
      { status: upstream.status === 404 ? 404 : 502 },
    );
  }

  const body = await upstream.arrayBuffer();
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

export const GET = handle;
