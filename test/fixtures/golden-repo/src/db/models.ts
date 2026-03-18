/**
 * Domain models — types and interfaces only, no logic.
 * Known characteristics:
 *   - Zero functions with logic
 *   - Zero imports
 *   - Pure type definitions
 */

export interface User {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  ipAddress: string;
  userAgent: string;
}

export interface TokenPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
  roles: string[];
}

export type AuthProvider = "local" | "google" | "github";

export interface AuthCredentials {
  provider: AuthProvider;
  email: string;
  secret: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: keyof User;
  order?: "asc" | "desc";
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageCount: number;
}
