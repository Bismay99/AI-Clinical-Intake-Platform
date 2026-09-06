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

function resolveUrl(path: string): string {
  const base = getBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export function storeToken(token: string): void {
  if (typeof window !== "undefined") localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window !== "undefined") localStorage.removeItem(TOKEN_KEY);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

function buildHeaders(isFormData = false, tokenOverride?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!isFormData) headers["Content-Type"] = "application/json";
  const rawToken = tokenOverride || getToken();
  const token = rawToken ? rawToken.trim() : null;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function handleResponse<T>(response: Response, requestPath?: string): Promise<T> {
  if (response.status === 401) {
    clearToken();

    // Do NOT navigate to /login if:
    // 1. This request is an authentication endpoint (/auth/login)
    // 2. The user is already on the /login page
    const isLoginEndpoint = requestPath === "/auth/login";
    const isLoginPage = typeof window !== "undefined" && window.location.pathname === "/login";

    if (!isLoginEndpoint && !isLoginPage && typeof window !== "undefined") {
      window.location.href = "/login";
    }

    let detail = "Invalid email or password.";
    try {
      const raw = await response.json();
      if (raw && typeof raw === "object" && "detail" in raw && typeof (raw as Record<string, unknown>).detail === "string") {
        detail = (raw as { detail: string }).detail;
      }
    } catch {
      /* non-JSON */
    }
    throw new ApiError(401, detail);
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    let raw: unknown;
    try {
      raw = await response.json();
      if (raw && typeof raw === "object" && "detail" in raw && typeof (raw as Record<string, unknown>).detail === "string") {
        detail = (raw as { detail: string }).detail;
      }
    } catch {
      /* non-JSON body */
    }
    throw new ApiError(response.status, detail, raw);
  }

  if (response.status === 204) return undefined as unknown as T;
  return response.json() as Promise<T>;
}

export async function apiGet<T>(path: string, tokenOverride?: string): Promise<T> {
  const r = await fetch(resolveUrl(path), {
    method: "GET",
    headers: buildHeaders(false, tokenOverride),
  });
  return handleResponse<T>(r, path);
}

export async function apiPost<T>(path: string, body?: unknown, tokenOverride?: string): Promise<T> {
  const r = await fetch(resolveUrl(path), {
    method: "POST",
    headers: buildHeaders(false, tokenOverride),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(r, path);
}

export async function apiPatch<T>(path: string, body?: unknown, tokenOverride?: string): Promise<T> {
  const r = await fetch(resolveUrl(path), {
    method: "PATCH",
    headers: buildHeaders(false, tokenOverride),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(r, path);
}

export async function apiDelete<T>(path: string, tokenOverride?: string): Promise<T> {
  const r = await fetch(resolveUrl(path), {
    method: "DELETE",
    headers: buildHeaders(false, tokenOverride),
  });
  return handleResponse<T>(r, path);
}

export async function apiPostForm<T>(path: string, formData: FormData, tokenOverride?: string): Promise<T> {
  const url = resolveUrl(path);
  const headers = buildHeaders(true, tokenOverride);
  const hasAuthorizationToken = typeof headers["Authorization"] === "string" && headers["Authorization"].length > 0;
  const tokenLength = hasAuthorizationToken ? headers["Authorization"].length : 0;

  const formDataFieldNames: string[] = [];
  let audioFileInfo: { size?: number; type?: string; name?: string } | null = null;
  formData.forEach((value, key) => {
    formDataFieldNames.push(key);
    if (key === "audio_file" && typeof value === "object" && value !== null) {
      const b = value as Blob & { name?: string };
      audioFileInfo = {
        size: b.size,
        type: b.type,
        name: b.name,
      };
    }
  });

  console.debug("[apiPostForm] Diagnostics before fetch:", {
    url,
    method: "POST",
    hasAuthorizationToken,
    tokenLength,
    formDataFieldNames,
    audioBlob: audioFileInfo,
  });

  try {
    const r = await fetch(url, {
      method: "POST",
      headers,
      body: formData,
    });
    console.debug("[apiPostForm] Response received:", {
      status: r.status,
      statusText: r.statusText,
    });
    return handleResponse<T>(r, path);
  } catch (err) {
    console.debug("[apiPostForm] Fetch threw error:", err);
    throw err;
  }
}