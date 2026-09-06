"use client";
import { create } from "zustand";
import type { UserResponse, UserRole } from "@/types/auth";
import { storeToken, clearToken } from "@/lib/api";

interface AuthState {
  user: UserResponse | null;
  token: string | null;
  role: UserRole | null;
  userId: string | null;
  isAuthenticated: boolean;
  isInitializing: boolean;

  setAuth: (token: string, user: UserResponse) => void;
  logout: () => void;
  setInitializing: (v: boolean) => void;
  /**
   * Called on app startup to restore token from localStorage.
   * Does NOT validate the token — caller must call /auth/me after.
   */
  hydrateFromStorage: () => string | null;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  role: null,
  userId: null,
  isAuthenticated: false,
  isInitializing: true,

  setAuth: (token, user) => {
    storeToken(token);
    set({
      token,
      user,
      role: user.role as UserRole,
      userId: user.id,
      isAuthenticated: true,
      isInitializing: false,
    });
  },

  logout: () => {
    clearToken();
    set({
      token: null,
      user: null,
      role: null,
      userId: null,
      isAuthenticated: false,
      isInitializing: false,
    });
  },

  setInitializing: (v) => set({ isInitializing: v }),

  hydrateFromStorage: () => {
    if (typeof window === "undefined") return null;
    const token = localStorage.getItem("ps47_token");
    if (token) {
      set({ token });
    }
    return token;
  },
}));