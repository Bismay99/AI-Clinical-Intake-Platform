/**
 * Centralised API client. Base URL from NEXT_PUBLIC_API_URL only.
 * Never hardcodes localhost. Attaches Bearer token automatically.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
    public readonly raw?: unknown,
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

const TOKEN_KEY = "ps47_token";

function getBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) throw new Error("NEXT_PUBLIC_API_URL is not set. Add it to frontend/.env.local");
  return url.replace(/\/$/, "");
}

export function storeToken(token: string): void {
  if (typeof window !== "undefined") localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window !== "undefined") localStorage.removeItem(TOKEN_KEY);
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

function buildHeaders(isFormData = false): HeadersInit {
  const headers: Record<string, string> = {};
  if (!isFormData) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    clearToken();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new ApiError(401, "Session expired. Please log in again.");
  }
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    let raw: unknown;
    try {
      raw = await response.json();
      if (raw && typeof raw === "object" && "detail" in raw && typeof (raw as Record<string, unknown>).detail === "string") {
        detail = (raw as { detail: string }).detail;
      }
    } catch { /* non-JSON body */ }
    throw new ApiError(response.status, detail, raw);
  }
  if (response.status === 204) return undefined as unknown as T;
  return response.json() as Promise<T>;
}

export async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${getBaseUrl()}${path}`, { method: "GET", headers: buildHeaders() });
  return handleResponse<T>(r);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${getBaseUrl()}${path}`, { method: "POST", headers: buildHeaders(), body: body !== undefined ? JSON.stringify(body) : undefined });
  return handleResponse<T>(r);
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${getBaseUrl()}${path}`, { method: "PATCH", headers: buildHeaders(), body: body !== undefined ? JSON.stringify(body) : undefined });
  return handleResponse<T>(r);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const r = await fetch(`${getBaseUrl()}${path}`, { method: "DELETE", headers: buildHeaders() });
  return handleResponse<T>(r);
}

export async function apiPostForm<T>(path: string, formData: FormData): Promise<T> {
  const r = await fetch(`${getBaseUrl()}${path}`, { method: "POST", headers: buildHeaders(true), body: formData });
  return handleResponse<T>(r);
}