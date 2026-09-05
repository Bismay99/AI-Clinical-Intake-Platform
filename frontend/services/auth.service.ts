import { apiGet, apiPost } from "@/lib/api";
import type { LoginRequest, TokenResponse, UserResponse } from "@/types/auth";

/** POST /auth/login */
export async function login(credentials: LoginRequest): Promise<TokenResponse> {
  return apiPost<TokenResponse>("/auth/login", credentials);
}

/** GET /auth/me */
export async function getMe(): Promise<UserResponse> {
  return apiGet<UserResponse>("/auth/me");
}