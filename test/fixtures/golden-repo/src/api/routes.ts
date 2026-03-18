/**
 * API routes — wires handlers to endpoints.
 * Known characteristics:
 *   - Imports: auth-service (from auth/), user-repository (from db/), logger — layering violation
 *   - A route file should not directly import db layer; it should go through a service
 *   - Part of connection.ts blast radius (depth 2 via user-repository)
 */

import { authenticate, logout } from "../auth/auth-service";
import { findUserById, listUsers } from "../db/user-repository";
import { info, warn } from "../utils/logger";

export interface Route {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

export function buildRoutes(): Route[] {
  return [
    {
      method: "POST",
      path: "/auth/login",
      handler: async (params) => {
        const { email, password, ip, userAgent } = params as {
          email: string;
          password: string;
          ip: string;
          userAgent: string;
        };
        info("Login route hit", { email });
        return authenticate(email, password, ip, userAgent);
      },
    },
    {
      method: "POST",
      path: "/auth/logout",
      handler: async (params) => {
        const { token } = params as { token: string };
        await logout(token);
        return { success: true };
      },
    },
    {
      method: "GET",
      path: "/users/:id",
      handler: async (params) => {
        const { id } = params as { id: string };
        const user = await findUserById(id);
        if (!user) {
          warn("User not found", { id });
          return { error: "Not found" };
        }
        return user;
      },
    },
    {
      method: "GET",
      path: "/users",
      handler: async (params) => {
        const { page, limit } = params as { page: number; limit: number };
        return listUsers({ page: page ?? 1, limit: limit ?? 20 });
      },
    },
  ];
}

export function matchRoute(
  routes: Route[],
  method: string,
  path: string
): Route | undefined {
  return routes.find((r) => {
    if (r.method !== method) return false;

    const routeParts = r.path.split("/");
    const pathParts = path.split("/");

    if (routeParts.length !== pathParts.length) return false;

    return routeParts.every(
      (part, i) => part.startsWith(":") || part === pathParts[i]
    );
  });
}
