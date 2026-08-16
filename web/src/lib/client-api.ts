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
    let detail = res.statusText;
    try {
      detail = (await res.json())?.detail ?? detail;
    } catch {
      /* ignore */
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
  /** Multipart upload — the browser sets the boundary. */
  upload: <T>(p: string, form: FormData) =>
    request<T>(p, { method: "POST", body: form }),
};

export const V1 = "/api/v1";
