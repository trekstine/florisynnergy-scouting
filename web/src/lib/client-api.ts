"use client";

// Browser data access — always via the Next.js proxy so the JWT stays in the
// httpOnly cookie and is never exposed to client JS.

export class ClientApiError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail);
    this.name = "ClientApiError";
  }
}

const PROXY = "/api/proxy";

/**
 * Turn whatever the API put in `detail` into a sentence.
 *
 * FastAPI answers a validation failure with `detail` as a *list* of objects —
 * `[{loc: ["body","tanks",0,"lines",1,"unit"], msg: "Input should be a valid
 * string"}]`. Passing that straight to `new Error()` stringifies it to
 * "[object Object]", so a 422 reached the screen saying nothing at all: the
 * save was rejected for a nameable reason and the form reported gibberish.
 */
function readDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((d) => {
        if (typeof d === "string") return d;
        if (d && typeof d === "object") {
          const { loc, msg } = d as { loc?: unknown[]; msg?: string };
          // Drop the leading "body" — it is true of every field and tells the
          // reader nothing about which one is wrong.
          const where = Array.isArray(loc)
            ? loc.filter((p) => p !== "body").join(" → ")
            : "";
          return where && msg ? `${where}: ${msg}` : (msg ?? "");
        }
        return "";
      })
      .filter(Boolean);
    if (parts.length) return parts.join("; ");
  }
  return fallback;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${PROXY}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      // FormData must set its own Content-Type so the multipart boundary
      // survives; forcing JSON here would corrupt every file upload.
      ...(init.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init.headers,
    },
  });
  if (res.status === 401) {
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new ClientApiError(401, "Session expired");
  }
  if (!res.ok) {
    let detail = res.statusText || `Request failed (${res.status})`;
    try {
      detail = readDetail((await res.json())?.detail, detail);
    } catch {
      /* a non-JSON body — the status line is all we have */
    }
    throw new ClientApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(p: string) => request<T>(p, { method: "DELETE" }),
  /** DELETE carrying a body — used where one call removes a selection. */
  delWithBody: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: "DELETE", body: body ? JSON.stringify(body) : undefined }),
  /** Multipart upload — the browser sets the boundary. */
  upload: <T>(p: string, form: FormData) =>
    request<T>(p, { method: "POST", body: form }),
};

export const V1 = "/api/v1";
