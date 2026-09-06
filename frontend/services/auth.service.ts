import { apiGet, apiPost } from "@/lib/api";
import type { LoginRequest, TokenResponse, UserResponse } from "@/types/auth";

/** POST /auth/login */
export async function login(credentials: LoginRequest): Promise<TokenResponse> {
  return apiPost<TokenResponse>("/auth/login", credentials);
}

/** GET /auth/me */
export async function getMe(tokenOverride?: string): Promise<UserResponse> {
  return apiGet<UserResponse>("/auth/me", tokenOverride);
}

/** POST /auth/google/exchange */
export async function exchangeGoogleTicket(ticket: string): Promise<TokenResponse> {
  return apiPost<TokenResponse>("/auth/google/exchange", { ticket });
}