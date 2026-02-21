#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# Prism container entrypoint
# 1. Wait for Postgres to be ready
# 2. Enable pgvector extension
# 3. Run Drizzle migrations
# 4. Start the Prism dashboard
# ---------------------------------------------------------------------------

echo "Prism: waiting for database to be ready..."

# Wait for Postgres to accept connections (up to 30 seconds)
for i in $(seq 1 30); do
    if node -e "
        const { Pool } = require('pg');
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        pool.query('SELECT 1').then(() => { pool.end(); process.exit(0); }).catch(() => { pool.end(); process.exit(1); });
    " 2>/dev/null; then
        echo "Prism: database is ready."
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "Prism: ERROR — database not reachable after 30 seconds."
        exit 1
    fi
    sleep 1
done

# Enable pgvector extension (idempotent)
echo "Prism: enabling pgvector extension..."
node -e "
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    pool.query('CREATE EXTENSION IF NOT EXISTS vector').then(() => { pool.end(); }).catch(err => { console.error(err); pool.end(); process.exit(1); });
"

# Run Drizzle migrations
echo "Prism: running database migrations..."
npx drizzle-kit migrate

echo "Prism: starting dashboard..."
exec node packages/app/dist/cli/index.js serve
