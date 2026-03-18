/**
 * User repository — data access layer for users.
 * Known characteristics:
 *   - Imports: connection, models (2 deps)
 *   - Imported by: auth-service, handlers (reverse deps)
 */

import { query, isConnected } from "./connection";
import type { User, PaginationParams, PaginatedResult } from "./models";

export async function findUserById(id: string): Promise<User | null> {
  const rows = await query<User>("SELECT * FROM users WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const rows = await query<User>("SELECT * FROM users WHERE email = $1", [email]);
  return rows[0] ?? null;
}

export async function createUser(
  email: string,
  displayName: string,
  passwordHash: string
): Promise<User> {
  const rows = await query<User>(
    "INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING *",
    [email, displayName, passwordHash]
  );

  if (rows.length === 0) {
    throw new Error("Failed to create user");
  }

  return rows[0];
}

export async function updateUser(id: string, fields: Partial<Pick<User, "displayName" | "email">>): Promise<User | null> {
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (fields.displayName !== undefined) {
    setClauses.push(`display_name = $${paramIndex++}`);
    params.push(fields.displayName);
  }

  if (fields.email !== undefined) {
    setClauses.push(`email = $${paramIndex++}`);
    params.push(fields.email);
  }

  if (setClauses.length === 0) {
    return findUserById(id);
  }

  params.push(id);
  const sql = `UPDATE users SET ${setClauses.join(", ")} WHERE id = $${paramIndex} RETURNING *`;
  const rows = await query<User>(sql, params);
  return rows[0] ?? null;
}

export async function deleteUser(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>("DELETE FROM users WHERE id = $1 RETURNING id", [id]);
  return rows.length > 0;
}

export async function listUsers(pagination: PaginationParams): Promise<PaginatedResult<User>> {
  if (!isConnected()) {
    throw new Error("Database not connected");
  }

  const offset = (pagination.page - 1) * pagination.limit;
  const sortCol = pagination.sortBy ?? "createdAt";
  const order = pagination.order ?? "asc";

  const countRows = await query<{ count: number }>("SELECT COUNT(*) as count FROM users");
  const total = countRows[0]?.count ?? 0;

  const rows = await query<User>(
    `SELECT * FROM users ORDER BY ${sortCol} ${order} LIMIT $1 OFFSET $2`,
    [pagination.limit, offset]
  );

  return {
    items: rows,
    total,
    page: pagination.page,
    pageCount: Math.ceil(total / pagination.limit),
  };
}
