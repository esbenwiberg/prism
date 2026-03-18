# Migration Guide: Controllers v1 to v2

This guide walks you through migrating from the v1 controller pattern to the v2 handler-based architecture.

## What Changed

In v1, each controller was a class with methods bound to routes. In v2, we moved to plain exported functions in `src/api/handlers.ts` that are wired up by `src/api/routes.ts`.

## Step-by-Step Migration

### 1. Replace Controller Classes

**Before (v1):**
```typescript
class UserController {
  async getUser(req: Request, res: Response) {
    const user = await this.userRepo.findById(req.params.id);
    res.json(user);
  }
}
```

**After (v2):**
```typescript
// In src/api/handlers.ts
export function handleGetUser(userId: string, role: string): ResponseBody {
  // Direct function, no class wrapper
}
```

### 2. Update Route Registration

Routes are now defined in `src/api/routes.ts` using the `buildRoutes()` function. Each route maps a method + path to a handler function.

### 3. Move Middleware

Auth middleware moved from controller base classes to `src/api/middleware.ts`. The `authMiddleware` function now works with a `RequestContext` instead of Express req/res.

### 4. Update Imports

- Old: `import { UserController } from './controllers/user'`
- New: `import { handleGetUser, handleCreateUser } from './api/handlers'`

## Files Affected

- `src/api/handlers.ts` — All handler functions live here now
- `src/api/routes.ts` — Route definitions
- `src/api/middleware.ts` — Auth and CORS middleware
- `src/auth/auth-service.ts` — Auth logic (unchanged API, internal refactor)

## Known Issues

- `handlers.ts` has grown large and should be split into domain-specific handler modules in a future iteration
- The circular dependency between `middleware.ts` and `auth-service.ts` was introduced during this migration and needs to be resolved
