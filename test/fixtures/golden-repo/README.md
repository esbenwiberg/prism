# GoldenApp

A demo authentication API built with TypeScript. This project serves as a reference implementation for common auth patterns including JWT tokens, session management, and role-based access control.

## Architecture

The codebase is organized into four modules:

- **auth/** — Authentication and session management
- **db/** — Database connection and data access
- **api/** — HTTP routes, middleware, and request handlers
- **utils/** — Shared utilities (logging, formatting, helpers)

## Getting Started

```bash
npm install
npm run build
npm start
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /auth/login | Authenticate with email/password |
| POST | /auth/logout | Terminate current session |
| GET | /users/:id | Get user by ID |
| GET | /users | List users with pagination |

## Configuration

Set the following environment variables:

- `DB_HOST` — Database hostname
- `DB_PORT` — Database port (default: 5432)
- `DB_NAME` — Database name
- `DB_USER` — Database user
- `DB_PASSWORD` — Database password
- `CORS_ORIGINS` — Comma-separated allowed origins
- `LOG_LEVEL` — Logging level (debug, info, warn, error)

## License

MIT
