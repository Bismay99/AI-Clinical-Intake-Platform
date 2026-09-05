export type UserRole = "patient" | "doctor" | "admin";
export interface LoginRequest { email: string; password: string; }
export interface TokenResponse { access_token: string; token_type: "bearer"; role: UserRole; user_id: string; }
export interface RegisterRequest { email: string; password: string; full_name: string; role: UserRole; hospital_affiliation?: string | null; }
export interface UserResponse { id: string; email: string; full_name: string | null; role: UserRole; hospital_affiliation: string | null; is_active: boolean; }